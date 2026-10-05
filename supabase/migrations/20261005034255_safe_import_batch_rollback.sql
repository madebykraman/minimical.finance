-- Track imported invoice identities and allow rollback only while a batch is still safely reversible.
alter table public.import_batch_rows drop constraint if exists import_batch_rows_status_check;
alter table public.import_batch_rows
  add constraint import_batch_rows_status_check
  check (status = any (array['ready','duplicate','blocked','resolved','imported','skipped','failed','rolled_back']::text[]));

create or replace function public.import_invoice_batch(p_rows jsonb)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  row_data jsonb;
  content_data jsonb;
  content_item jsonb;
  org_id uuid;
  client_id uuid;
  project_id uuid;
  invoice_id uuid;
  supplied_number text;
  invoice_number text;
  client_name text;
  assigned_by text;
  project_name text;
  issue_date date;
  due_date date;
  amount numeric;
  payment_amount numeric;
  payment_date date;
  description text;
  requested_status public.invoice_status;
  payment_method public.payment_method;
  content_position integer;
  content_title text;
  content_amount numeric;
  content_note text;
  content_assigned_by text;
  content_sum numeric;
  content_count integer;
  total_created integer := 0;
  total_paid numeric;
  created_invoices jsonb := '[]'::jsonb;
begin
  if not private.is_workspace_member() then raise exception 'Workspace access denied'; end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then raise exception 'Import payload must be a JSON array'; end if;
  for row_data in select value from jsonb_array_elements(p_rows) loop
    org_id := nullif(row_data->>'organizationId','')::uuid;
    client_name := nullif(trim(row_data->>'clientName'),'');
    assigned_by := nullif(trim(row_data->>'assignedBy'),'');
    project_name := nullif(trim(row_data->>'projectName'),'');
    supplied_number := nullif(trim(row_data->>'invoiceNumber'),'');
    issue_date := nullif(row_data->>'issueDate','')::date;
    due_date := nullif(row_data->>'dueDate','')::date;
    amount := coalesce(nullif(row_data->>'amount','')::numeric,0);
    payment_amount := coalesce(nullif(row_data->>'paymentAmount','')::numeric,0);
    payment_date := nullif(row_data->>'paymentDate','')::date;
    description := nullif(trim(row_data->>'description'),'');
    requested_status := coalesce(nullif(row_data->>'status','')::public.invoice_status,'draft'::public.invoice_status);
    payment_method := coalesce(nullif(row_data->>'paymentMethod','')::public.payment_method,'bank_transfer'::public.payment_method);
    content_data := coalesce(row_data->'contents','[]'::jsonb);
    if org_id is null or client_name is null or issue_date is null then raise exception 'Import row is missing organisation, client, or issue date'; end if;
    if amount < 0 then raise exception 'Imported invoice amount cannot be negative'; end if;
    if payment_amount < 0 or payment_amount > amount then raise exception 'Imported payment cannot exceed the invoice amount'; end if;
    if jsonb_typeof(content_data) <> 'array' then raise exception 'Imported invoice contents must be an array'; end if;
    if not exists (select 1 from public.organizations o where o.id=org_id and o.status not in ('dissolved','discontinued')) then raise exception 'Organisation is unavailable for import'; end if;

    select c.id into client_id from public.clients c where c.organization_id=org_id and lower(trim(c.name))=lower(trim(client_name)) limit 1;
    if client_id is null then insert into public.clients(organization_id,name) values(org_id,client_name) returning id into client_id; end if;

    project_id := null;
    if project_name is not null then
      select p.id into project_id from public.projects p where p.organization_id=org_id and p.client_id=client_id and lower(trim(p.name))=lower(trim(project_name)) limit 1;
      if project_id is null then insert into public.projects(organization_id,client_id,name) values(org_id,client_id,project_name) returning id into project_id; end if;
    end if;

    if supplied_number is null then
      invoice_number := public.allocate_invoice_number(org_id);
    else
      invoice_number := supplied_number;
      if exists (select 1 from public.invoices i where i.organization_id=org_id and lower(i.invoice_number)=lower(invoice_number)) then raise exception 'Invoice number % already exists in this organisation',invoice_number; end if;
    end if;

    content_sum := 0;
    content_count := jsonb_array_length(content_data);
    insert into public.invoices(invoice_number,client_id,project_id,issue_date,due_date,status,source_total,organization_id)
    values(invoice_number,client_id,project_id,issue_date,due_date,'draft'::public.invoice_status,amount,org_id)
    returning id into invoice_id;

    if content_count > 0 then
      content_position := 0;
      for content_item in select value from jsonb_array_elements(content_data) loop
        content_title := nullif(trim(content_item->>'title'),'');
        content_amount := nullif(content_item->>'amount','')::numeric;
        content_note := nullif(trim(content_item->>'note'),'');
        content_assigned_by := nullif(trim(content_item->>'assignedBy'),'');
        if content_title is null then continue; end if;
        if content_amount is not null and content_amount < 0 then raise exception 'Imported invoice content amount cannot be negative'; end if;
        content_sum := content_sum + coalesce(content_amount,0);
        insert into public.invoice_contents(invoice_id,position,kind,title,quantity,rate,amount,priced,note,assigned_by)
        values(invoice_id,content_position,'service'::public.invoice_content_kind,content_title,1,content_amount,content_amount,content_amount is not null,content_note,coalesce(content_assigned_by,assigned_by));
        content_position := content_position + 1;
      end loop;
      if content_sum > amount then raise exception 'Imported line items exceed the invoice total'; end if;
    else
      insert into public.invoice_contents(invoice_id,position,kind,title,quantity,rate,amount,priced,note,assigned_by)
      values(invoice_id,0,'service'::public.invoice_content_kind,coalesce(description,'Imported invoice'),1,amount,amount,true,null,assigned_by);
    end if;

    if payment_amount > 0 then
      insert into public.payments(invoice_id,amount,payment_date,method,organization_id) values(invoice_id,payment_amount,payment_date,payment_method,org_id);
    end if;
    select coalesce(sum(p.amount),0) into total_paid from public.payments p where p.invoice_id=invoice_id;
    update public.invoices
      set status=case when requested_status='void' then 'void'::public.invoice_status when total_paid>=amount and amount>0 then 'paid'::public.invoice_status when total_paid>0 then 'partially_paid'::public.invoice_status else requested_status end,
          source_total=amount,updated_at=now()
      where id=invoice_id;
    insert into public.activity_log(invoice_id,action,metadata)
      values(invoice_id,'invoice_imported',jsonb_build_object('organization_id',org_id,'invoice_number',invoice_number,'amount',amount,'payment_amount',payment_amount,'content_count',content_count));
    created_invoices := created_invoices || jsonb_build_array(jsonb_build_object('id',invoice_id,'invoiceNumber',invoice_number));
    total_created := total_created + 1;
  end loop;
  return jsonb_build_object('created',total_created,'atomic',true,'invoices',created_invoices);
end;
$function$;

create or replace function public.rollback_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  b public.import_batches%rowtype;
  invoice_ids uuid[];
  deleted_count integer := 0;
begin
  if not private.is_workspace_member() then raise exception 'Workspace access denied'; end if;

  select * into b from public.import_batches where id=p_batch_id for update;
  if b.id is null then raise exception 'Import batch not found'; end if;
  if b.status <> 'completed' then raise exception 'Only completed import batches can be rolled back'; end if;

  select coalesce(array_agg(distinct r.invoice_id) filter (where r.invoice_id is not null),'{}'::uuid[])
    into invoice_ids
  from public.import_batch_rows r
  where r.batch_id=p_batch_id;

  if coalesce(array_length(invoice_ids,1),0)=0 then raise exception 'This import has no linked invoices to roll back'; end if;

  if exists(select 1 from public.invoices i where i.id=any(invoice_ids) and i.status <> 'draft') then
    raise exception 'Rollback refused: an imported invoice is no longer a draft';
  end if;
  if exists(select 1 from public.payments p where p.invoice_id=any(invoice_ids)) then
    raise exception 'Rollback refused: an imported invoice has payments';
  end if;
  if exists(select 1 from public.documents d where d.invoice_id=any(invoice_ids)) then
    raise exception 'Rollback refused: an imported invoice has documents';
  end if;
  if exists(select 1 from public.invoice_versions v where v.invoice_id=any(invoice_ids)) then
    raise exception 'Rollback refused: an imported invoice has issued versions';
  end if;
  if exists(select 1 from public.activity_log a where a.invoice_id=any(invoice_ids) and b.completed_at is not null and a.created_at>b.completed_at) then
    raise exception 'Rollback refused: an imported invoice changed after the import completed';
  end if;

  delete from public.invoices where id=any(invoice_ids);
  get diagnostics deleted_count = row_count;

  update public.import_batch_rows
    set status='rolled_back',
        resolution=coalesce(resolution,'{}'::jsonb)||jsonb_build_object('rolled_back',true,'rolled_back_at',now())
  where batch_id=p_batch_id and status='imported';

  update public.import_batches
    set status='cancelled',
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('rolled_back_at',now(),'rolled_back_by',auth.uid())
  where id=p_batch_id;

  return jsonb_build_object('rolled_back',deleted_count,'safe',true);
end;
$function$;

revoke all on function public.rollback_import_batch(uuid) from public, anon;
grant execute on function public.rollback_import_batch(uuid) to authenticated;

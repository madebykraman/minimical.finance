CREATE OR REPLACE FUNCTION public.save_invoice(p_invoice_id uuid, p_client_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_adjustment_note text DEFAULT NULL::text, p_issue_date date DEFAULT NULL::date, p_due_date date DEFAULT NULL::date, p_status invoice_status DEFAULT 'draft'::invoice_status, p_organization_id uuid DEFAULT NULL::uuid, p_contents jsonb DEFAULT '[]'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_paid numeric := 0;
  v_total numeric := 0;
  v_item jsonb;
  v_position integer := 0;
  v_final_status public.invoice_status;
  v_previous_status public.invoice_status;
  v_next_version integer;
  v_snapshot jsonb;
  v_snapshot_hash text;
  v_actor uuid;
begin
  if p_organization_id is null then raise exception 'Select a billing organisation before saving the invoice'; end if;

  select i.status into v_previous_status
  from public.invoices i
  where i.id=p_invoice_id
  for update;

  if v_previous_status is null then raise exception 'Invoice not found'; end if;
  if v_previous_status='void' and p_status<>'void' then raise exception 'A void invoice cannot be reopened'; end if;
  if v_previous_status<>'draft' and p_status='draft' then raise exception 'An issued invoice cannot be returned to draft'; end if;
  if not exists(select 1 from public.organizations o where o.id=p_organization_id) then raise exception 'Billing organisation not found'; end if;
  if p_client_id is not null and not exists(select 1 from public.clients c where c.id=p_client_id and c.organization_id=p_organization_id) then raise exception 'Selected client does not belong to the billing organisation'; end if;
  if p_project_id is not null and not exists(select 1 from public.projects p where p.id=p_project_id and p.organization_id=p_organization_id and (p_client_id is null or p.client_id=p_client_id)) then raise exception 'Selected project does not belong to the billing organisation and client'; end if;

  select coalesce(sum(amount),0) into v_paid from public.payments where invoice_id=p_invoice_id;
  select coalesce(sum(case when coalesce((value->>'priced')::boolean,false)
    then coalesce((value->>'amount')::numeric,coalesce((value->>'quantity')::numeric,1)*coalesce((value->>'rate')::numeric,0))
    else 0 end),0)
  into v_total from jsonb_array_elements(coalesce(p_contents,'[]'::jsonb));

  if v_paid>v_total then raise exception 'Invoice contents total cannot be lower than payments already recorded'; end if;
  if p_due_date is not null and p_issue_date is not null and p_due_date<p_issue_date then raise exception 'Due date cannot be earlier than issue date'; end if;

  update public.invoices
  set client_id=p_client_id,project_id=p_project_id,notes=p_notes,adjustment_note=p_adjustment_note,
      issue_date=p_issue_date,due_date=p_due_date,organization_id=p_organization_id,updated_at=now()
  where id=p_invoice_id;

  delete from public.invoice_contents where invoice_id=p_invoice_id;
  for v_item in select value from jsonb_array_elements(coalesce(p_contents,'[]'::jsonb)) loop
    insert into public.invoice_contents(invoice_id,position,kind,title,quantity,rate,amount,priced,note,assigned_by)
    values(
      p_invoice_id,v_position,(v_item->>'kind')::public.invoice_content_kind,coalesce(v_item->>'title',''),
      coalesce(nullif(v_item->>'quantity','')::numeric,1),nullif(v_item->>'rate','')::numeric,
      case when coalesce((v_item->>'priced')::boolean,false)
        then coalesce(nullif(v_item->>'amount','')::numeric,coalesce(nullif(v_item->>'quantity','')::numeric,1)*coalesce(nullif(v_item->>'rate','')::numeric,0))
        else null end,
      coalesce((v_item->>'priced')::boolean,false),nullif(v_item->>'note',''),nullif(trim(v_item->>'assignedBy'),'')
    );
    v_position:=v_position+1;
  end loop;

  if p_status in ('draft','void') then v_final_status:=p_status;
  elsif v_total>0 and v_paid>=v_total then v_final_status:='paid';
  elsif v_paid>0 then v_final_status:='partially_paid';
  else v_final_status:='sent'; end if;

  insert into public.activity_log(invoice_id,action,metadata)
  values(p_invoice_id,'invoice_updated',jsonb_build_object('content_count',v_position,'total',v_total,'requested_status',p_status));

  if v_previous_status='draft' and v_final_status='sent' then
    update public.invoices set status='draft',updated_at=now() where id=p_invoice_id;
    perform public.issue_invoice(p_invoice_id);
    return;
  end if;

  update public.invoices set status=v_final_status,updated_at=now() where id=p_invoice_id;

  if v_previous_status<>'draft' and v_final_status not in ('draft','void') then
    v_snapshot:=public.invoice_snapshot(p_invoice_id);
    v_snapshot_hash:=encode(extensions.digest(v_snapshot::text,'sha256'),'hex');
    select coalesce(max(version_number),0)+1 into v_next_version
      from public.invoice_versions where invoice_id=p_invoice_id;
    select auth.uid() into v_actor;

    insert into public.invoice_versions(invoice_id,organization_id,version_number,snapshot,snapshot_hash,created_by)
    values(p_invoice_id,p_organization_id,v_next_version,v_snapshot,v_snapshot_hash,v_actor);

    update public.invoices
      set issued_version=v_next_version,issued_at=coalesce(issued_at,now()),updated_at=now()
      where id=p_invoice_id;

    insert into public.documents(
      invoice_id,client_id,organization_id,document_type,file_path,file_name,
      visible_to_client,description,mime_type,status,version_number,template_key,source_hash,issued_at
    )
    select p_invoice_id,p_client_id,p_organization_id,'invoice_pdf','','INV_'||i.invoice_number||'.pdf',
           false,'Canonical issued invoice','application/pdf','pending',v_next_version,
           o.invoice_template_key,v_snapshot_hash,now()
    from public.invoices i join public.organizations o on o.id=p_organization_id
    where i.id=p_invoice_id
    on conflict (invoice_id,document_type,version_number) where invoice_id is not null and document_type <> 'receipt_pdf' do nothing;

    insert into public.activity_log(invoice_id,action,metadata)
    values(p_invoice_id,'invoice_reissued',jsonb_build_object('version_number',v_next_version,'snapshot_hash',v_snapshot_hash,'issued_at',now()));
  end if;
end;
$function$
;

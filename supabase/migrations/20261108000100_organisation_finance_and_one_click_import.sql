-- Organisation-led workbook finance rebuild.
-- Adds an independent finance data model to the original tracker schema.
-- Historical workbook records are imported one time into the database, never read
-- from a spreadsheet at runtime. This is a schema-only migration.
create table if not exists public.tracker_organizations (
 id uuid primary key default gen_random_uuid(),
 name text not null unique check (length(btrim(name))>0),
 status text not null default 'active' check (status in ('active','dissolved')),
 legal_name text, email text, phone text, address text, gstin text, pan text,
 bank_name text, bank_account text, bank_ifsc text,
 invoice_prefix text not null default 'INV-', invoice_footer text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.tracker_organizations enable row level security;
revoke all on public.tracker_organizations from anon;
grant select,insert,update,delete on public.tracker_organizations to authenticated;
drop policy if exists "workspace organisations" on public.tracker_organizations;
create policy "workspace organisations" on public.tracker_organizations for all to authenticated
using ((select private.is_workspace_member()))
with check ((select private.is_workspace_member()));

alter table public.tracker_snapshots add column if not exists organization_id uuid references public.tracker_organizations(id) on delete cascade;
alter table public.tracker_clients add column if not exists organization_id uuid references public.tracker_organizations(id) on delete cascade;
alter table public.tracker_clients add column if not exists address text;
alter table public.tracker_clients add column if not exists gstin text;
alter table public.tracker_clients add column if not exists archived_at timestamptz;
alter table public.tracker_rows add column if not exists organization_id uuid references public.tracker_organizations(id) on delete cascade;
alter table public.tracker_rows add column if not exists source_paid boolean not null default false;
alter table public.tracker_rows add column if not exists source_paid_on date;
alter table public.tracker_rows add column if not exists source_payment_note text;
alter table public.tracker_rows add column if not exists import_key text;
alter table public.tracker_rows add column if not exists source_kind text;
alter table public.tracker_rows add column if not exists quantity numeric(12,3) not null default 1 check (quantity>0);
alter table public.tracker_rows add column if not exists unit_price numeric(14,2) check (unit_price is null or unit_price>=0);
alter table public.tracker_rows add column if not exists invoice_due_date date;
alter table public.tracker_rows add column if not exists invoice_tax_rate numeric(5,2) check (invoice_tax_rate is null or (invoice_tax_rate>=0 and invoice_tax_rate<=100));
alter table public.tracker_rows add column if not exists invoice_tax_amount numeric(14,2) check (invoice_tax_amount is null or invoice_tax_amount>=0);
alter table public.tracker_rows add column if not exists invoice_public_notes text;
alter table public.tracker_rows add column if not exists invoice_created_in_app boolean not null default false;
alter table public.tracker_payments add column if not exists organization_id uuid references public.tracker_organizations(id) on delete cascade;
alter table public.tracker_documents add column if not exists organization_id uuid references public.tracker_organizations(id) on delete cascade;

create unique index if not exists tracker_snapshot_org_uniq on public.tracker_snapshots(organization_id) where organization_id is not null;
create unique index if not exists tracker_clients_org_name_uniq on public.tracker_clients(organization_id,lower(btrim(name))) where organization_id is not null;
create unique index if not exists tracker_rows_org_import_key_uniq on public.tracker_rows(organization_id,import_key) where import_key is not null;
create index if not exists tracker_rows_org_invoice_idx on public.tracker_rows(organization_id,invoice_number);
create index if not exists tracker_rows_org_order_idx on public.tracker_rows(organization_id,row_order);
create index if not exists tracker_payments_org_idx on public.tracker_payments(organization_id,invoice_number);
create index if not exists tracker_docs_org_idx on public.tracker_documents(organization_id);
create index if not exists tracker_clients_org_idx on public.tracker_clients(organization_id);

create table if not exists public.tracker_import_batches (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.tracker_organizations(id) on delete cascade,
 file_sha256 text not null check(file_sha256 ~ '^[0-9a-f]{64}$'),
 file_label text not null,
 imported_count integer not null default 0,
 updated_count integer not null default 0,
 skipped_count integer not null default 0,
 flagged_count integer not null default 0,
 summary jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(organization_id,file_sha256)
);
alter table public.tracker_import_batches enable row level security;
revoke all on public.tracker_import_batches from anon;
grant select,insert,update on public.tracker_import_batches to authenticated;
drop policy if exists "workspace imports" on public.tracker_import_batches;
create policy "workspace imports" on public.tracker_import_batches for all to authenticated
using ((select private.is_workspace_member()))
with check ((select private.is_workspace_member()));

CREATE OR REPLACE FUNCTION public.tracker_validate_org_links()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if new.organization_id is null then return new; end if;
 if new.snapshot_id is not null and not exists(
   select 1 from public.tracker_snapshots s where s.id=new.snapshot_id and s.organization_id=new.organization_id
 ) then raise exception 'Work item belongs to a different organisation snapshot'; end if;
 if new.client_id is not null and not exists(
   select 1 from public.tracker_clients c where c.id=new.client_id and c.organization_id=new.organization_id
 ) then raise exception 'Client belongs to a different organisation'; end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.tracker_validate_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_total numeric;v_paid numeric;v_source_paid boolean;v_is_draft boolean;
begin
 if new.organization_id is null or new.invoice_number is null or new.amount is null or new.amount<=0 then raise exception 'Invalid organisation, invoice or payment'; end if;
 perform pg_advisory_xact_lock(hashtextextended('tracker:payment:'||new.organization_id::text||':'||new.invoice_number,0));
 select max(invoice_printed_total),coalesce(bool_or(source_paid),false),coalesce(bool_or(invoice_state='Draft'),false)
 into v_total,v_source_paid,v_is_draft from public.tracker_rows
 where organization_id=new.organization_id and invoice_number=new.invoice_number;
 if v_total is null then raise exception 'Invoice group missing or has no total'; end if;
 if v_source_paid then raise exception 'Invoice is already marked settled in opening records'; end if;
 if v_is_draft then raise exception 'Issue this draft invoice before recording payment';end if;
 select coalesce(sum(amount),0) into v_paid from public.tracker_payments
 where organization_id=new.organization_id and invoice_number=new.invoice_number and id is distinct from new.id;
 if v_paid+new.amount>v_total then raise exception 'Payment exceeds outstanding invoice balance'; end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.tracker_create_organisation_invoice(p_organization_id uuid, p_number text, p_date date, p_total numeric, p_row_ids uuid[])
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_rows integer;v_first uuid;v_snapshot uuid;
begin
 if not (select private.is_workspace_member()) then raise exception 'Access denied';end if;
 if not exists(select 1 from public.tracker_organizations where id=p_organization_id) then raise exception 'Organisation not found';end if;
 p_number:=btrim(coalesce(p_number,''));
 if p_number !~ '^[a-zA-Z0-9-]{1,48}$' or p_total is null or p_total<0 or p_date is null or coalesce(cardinality(p_row_ids),0)=0 then
  raise exception 'Invalid invoice details';
 end if;
 if cardinality(p_row_ids)<>(select count(distinct x) from unnest(p_row_ids) x) then raise exception 'Duplicate work items';end if;
 perform pg_advisory_xact_lock(hashtextextended('tracker:invoice:'||p_organization_id::text||':'||lower(p_number),0));
 if exists(select 1 from public.tracker_rows where organization_id=p_organization_id and lower(invoice_number)=lower(p_number))
 then raise exception 'Invoice number is already used by this organisation';end if;
 perform id from public.tracker_rows where organization_id=p_organization_id and id=any(p_row_ids) order by id for update;
 select count(*) into v_rows from public.tracker_rows where organization_id=p_organization_id
 and id=any(p_row_ids) and invoice_number is null;
 if v_rows<>cardinality(p_row_ids) then raise exception 'Work selection changed, please reload';end if;
 v_first:=p_row_ids[1];
 update public.tracker_rows set
 invoice_number=p_number,
 invoice_printed_total=case when id=v_first then p_total else null end,
 invoice_date=case when id=v_first then p_date else null end,
 invoice_state=case when id=v_first then 'Draft' else null end,
 payment_state=case when id=v_first then 'Unpaid' else null end,
 updated_at=now()
 where id=any(p_row_ids) and organization_id=p_organization_id and invoice_number is null;
 return p_number;
end $function$;

CREATE OR REPLACE FUNCTION public.tracker_apply_import(p_organization_id uuid, p_file_hash text, p_file_label text, p_records jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_previous jsonb;
 v_snapshot uuid;
 v_item jsonb;
 v_client_name text;
 v_client_id uuid;
 v_existing_client record;
 v_name text;
 v_existing record;
 v_key text;
 v_amount numeric;
 v_invoice text;
 v_issue date;
 v_paid_date date;
 v_total numeric;
 v_invoice_status text;
 v_paid_state text;
 v_source_paid boolean;
 v_assigned text;
 v_notes text;
 v_doc text;
 v_created integer:=0;
 v_updated integer:=0;
 v_skipped integer:=0;
 v_flagged integer:=0;
 v_row_order integer;
 v_batch uuid;
 v_issues jsonb:='[]'::jsonb;
 v_index integer:=0;
 v_number text; v_first uuid; v_payments jsonb:='[]'::jsonb; v_payment jsonb; v_payment_amount numeric; v_payment_date date; v_payment_method text; v_payment_ref text; v_payment_invoice text; v_total_paid numeric; v_total_due numeric; v_settled boolean;
begin
 if not (select private.is_workspace_member()) then raise exception 'Access denied';end if;
 if not exists(select 1 from public.tracker_organizations where id=p_organization_id) then raise exception 'Organisation not found';end if;
 if p_file_hash !~ '^[0-9a-f]{64}$' or length(coalesce(p_file_label,'')) not between 1 and 180
    or jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records)<1 or jsonb_array_length(p_records)>10000
 then raise exception 'Invalid import request';end if;
 perform pg_advisory_xact_lock(hashtextextended('tracker:import:'||p_organization_id::text,0));
 select summary into v_previous from public.tracker_import_batches
 where organization_id=p_organization_id and file_sha256=p_file_hash;
 if found then return v_previous||jsonb_build_object('already_imported',true);end if;
 select id into v_snapshot from public.tracker_snapshots where organization_id=p_organization_id for update;
 if v_snapshot is null then
   insert into public.tracker_snapshots(organization_id,source_title,source_file_name,owner_name,balance_as_of,reported_pending)
   select id,'Imported records','',name,current_date,0 from public.tracker_organizations where id=p_organization_id
   returning id into v_snapshot;
 end if;
 select coalesce(max(row_order),0) into v_row_order from public.tracker_rows where organization_id=p_organization_id;
 for v_item in select value from jsonb_array_elements(p_records) loop
   v_index:=v_index+1;
   if jsonb_typeof(v_item)<>'object' then v_flagged:=v_flagged+1;continue;end if;
   if v_item->>'kind'='payment' then
     v_payments:=v_payments||jsonb_build_array(v_item);continue;
   end if;
   v_client_name:=left(btrim(coalesce(v_item->>'client','')),200);
   v_name:=left(btrim(coalesce(v_item->>'project_name','')),500);
   if v_client_name='' and v_name='' then v_skipped:=v_skipped+1;continue;end if;
   v_client_id:=null;
   if v_client_name<>'' then
     select id,email,phone,notes into v_existing_client from public.tracker_clients
       where organization_id=p_organization_id and lower(btrim(name))=lower(v_client_name) limit 1;
     if found then
       v_client_id:=v_existing_client.id;
       if nullif(btrim(coalesce(v_item->>'email','')),'') is not null
         or nullif(btrim(coalesce(v_item->>'phone','')),'') is not null then
         update public.tracker_clients set
           email=coalesce(nullif(btrim(v_item->>'email'),''),email),
           phone=coalesce(nullif(btrim(v_item->>'phone'),''),phone),
           address=coalesce(nullif(btrim(v_item->>'address'),''),address),
           gstin=coalesce(nullif(btrim(v_item->>'gstin'),''),gstin)
         where id=v_client_id;
       end if;
     else
       insert into public.tracker_clients(organization_id,name,email,phone,address,gstin,from_source_pdf)
       values(p_organization_id,v_client_name,nullif(btrim(v_item->>'email'),''),
         nullif(btrim(v_item->>'phone'),''),nullif(btrim(v_item->>'address'),''),
         nullif(btrim(v_item->>'gstin'),''),false) returning id into v_client_id;
       v_created:=v_created+1;
     end if;
   end if;
   if v_name='' then
     if v_client_id is not null then v_updated:=v_updated+1;end if;
     continue;
   end if;
   if v_item ? 'amount' and v_item->>'amount' is not null then
     begin v_amount:=(v_item->>'amount')::numeric;exception when others then v_amount:=null;end;
     if v_amount is null or v_amount<0 or v_amount>1000000000000 then
       v_flagged:=v_flagged+1;
       if jsonb_array_length(v_issues)<30 then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('row',v_index,'reason','Invalid amount'));end if;
       continue;
     end if;
   else v_amount:=null;end if;
   v_invoice:=nullif(btrim(coalesce(v_item->>'invoice','')),'');
   if v_invoice is not null and v_invoice !~ '^[a-zA-Z0-9-]{1,48}$' then
     v_flagged:=v_flagged+1;continue;
   end if;
   begin
     v_total:=nullif(v_item->>'invoice_total','')::numeric;
     v_issue:=nullif(v_item->>'invoice_date','')::date;
     v_paid_date:=nullif(v_item->>'paid_date','')::date;
     v_source_paid:=case when v_item ? 'source_paid' then (v_item->>'source_paid')::boolean else null end;
   exception when others then
     v_flagged:=v_flagged+1;
     if jsonb_array_length(v_issues)<30 then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('row',v_index,'reason','Invalid invoice date or total'));end if;
     continue;
   end;
   if v_total is not null and (v_total<0 or v_total>1000000000000) then v_flagged:=v_flagged+1;continue;end if;
   v_invoice_status:=nullif(btrim(coalesce(v_item->>'invoice_status','')),'');
   v_paid_state:=nullif(btrim(coalesce(v_item->>'payment_state','')),'');
   v_assigned:=nullif(btrim(coalesce(v_item->>'assigned_by','')),'');
   v_notes:=nullif(left(btrim(coalesce(v_item->>'notes','')),10000),'');
   v_doc:=nullif(left(btrim(coalesce(v_item->>'invoice_document','')),250),'');
   v_key:=md5(lower(btrim(v_client_name))||':'||lower(v_name));
   select id,invoice_number,amount,client_id,invoice_printed_total into v_existing
   from public.tracker_rows where organization_id=p_organization_id
     and (import_key=v_key or (lower(btrim(project_name))=lower(v_name) and client_id is not distinct from v_client_id))
     order by case when import_key=v_key then 0 else 1 end limit 1 for update;
   if found then
     if v_invoice is not null and v_existing.invoice_number is not null and v_invoice<>v_existing.invoice_number then
       v_flagged:=v_flagged+1;
       if jsonb_array_length(v_issues)<30 then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('row',v_index,'reason','Existing work belongs to a different invoice'));end if;
       continue;
     end if;
     if v_client_id is not null and v_existing.client_id is not null and v_client_id<>v_existing.client_id then
       v_flagged:=v_flagged+1;
       if jsonb_array_length(v_issues)<30 then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('row',v_index,'reason','Existing work belongs to a different client'));end if;
       continue;
     end if;
     update public.tracker_rows set
       import_key=v_key,
       assigned_by=coalesce(v_assigned,assigned_by),
       amount=coalesce(v_amount,amount),
       client_id=coalesce(v_client_id,client_id),
       invoice_number=coalesce(v_invoice,invoice_number),
       invoice_printed_total=coalesce(v_total,invoice_printed_total),
       invoice_date=coalesce(v_issue,invoice_date),
       invoice_state=coalesce(v_invoice_status,invoice_state),
       payment_state=coalesce(v_paid_state,payment_state),
       invoice_pdf_name=coalesce(v_doc,invoice_pdf_name),
       source_paid=coalesce(v_source_paid,source_paid),
       source_paid_on=coalesce(v_paid_date,source_paid_on),
       payment_date=coalesce(v_paid_date,payment_date),
       notes=coalesce(v_notes,notes),
       updated_at=now()
     where id=v_existing.id;
     v_updated:=v_updated+1;
   else
     v_row_order:=v_row_order+1;
     insert into public.tracker_rows(
       organization_id,snapshot_id,client_id,row_order,project_name,import_key,
       assigned_by,amount,invoice_number,invoice_printed_total,invoice_date,
       invoice_state,payment_state,invoice_pdf_name,source_paid,source_paid_on,
       payment_date,notes,source_kind,from_source_pdf)
     values(p_organization_id,v_snapshot,v_client_id,v_row_order,v_name,v_key,
       v_assigned,v_amount,v_invoice,v_total,v_issue,v_invoice_status,
       v_paid_state,v_doc,coalesce(v_source_paid,false),v_paid_date,
       v_paid_date,v_notes,'imported_file',false);
     v_created:=v_created+1;
   end if;
 end loop;
 for v_invoice in select distinct invoice_number from public.tracker_rows
   where organization_id=p_organization_id and invoice_number is not null loop
     if not exists(select 1 from public.tracker_rows
      where organization_id=p_organization_id and invoice_number=v_invoice and invoice_printed_total is not null)
      and not exists(select 1 from public.tracker_rows
      where organization_id=p_organization_id and invoice_number=v_invoice and amount is null) then
       select id into v_first from public.tracker_rows
       where organization_id=p_organization_id and invoice_number=v_invoice
       order by row_order limit 1;
       update public.tracker_rows set invoice_printed_total=(
        select round(sum(amount),2) from public.tracker_rows
        where organization_id=p_organization_id and invoice_number=v_invoice
       ),updated_at=now() where id=v_first;
     end if;
   end loop;
   for v_payment in select value from jsonb_array_elements(v_payments) loop
     begin
       v_payment_invoice:=nullif(btrim(v_payment->>'invoice'),'');
       v_payment_amount:=nullif(v_payment->>'payment_amount','')::numeric;
       v_payment_date:=nullif(v_payment->>'paid_date','')::date;
       v_payment_method:=lower(coalesce(nullif(btrim(v_payment->>'payment_method'),''),'other'));
       v_payment_ref:=nullif(left(btrim(coalesce(v_payment->>'payment_reference','')),150),'');
     exception when others then
       v_flagged:=v_flagged+1;
       if jsonb_array_length(v_issues)<30 then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('row',v_index,'reason','Invalid payment amount or date'));end if;
       continue;
     end;
     if v_payment_invoice !~ '^[A-Za-z0-9-]{1,48}$' or v_payment_amount is null or v_payment_amount<=0
      or v_payment_amount>1000000000000 or v_payment_date is null then
       v_flagged:=v_flagged+1;
       if jsonb_array_length(v_issues)<30 then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('reason','Payment requires an invoice, positive amount and date'));end if;
       continue;
     end if;
     select max(invoice_printed_total),coalesce(bool_or(source_paid),false)
       into v_total_due,v_settled
       from public.tracker_rows where organization_id=p_organization_id and invoice_number=v_payment_invoice;
     if v_total_due is null or v_settled then
       v_flagged:=v_flagged+1;
       if jsonb_array_length(v_issues)<30 then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('reason','Payment invoice is missing or already settled','invoice',v_payment_invoice));end if;
       continue;
     end if;
     if v_payment_method like '%upi%' then v_payment_method:='upi';
     elsif v_payment_method like '%cash%' then v_payment_method:='cash';
     elsif v_payment_method like '%card%' then v_payment_method:='card';
     elsif v_payment_method like '%bank%' or v_payment_method like '%neft%' or v_payment_method like '%imps%' or v_payment_method like '%rtgs%' or v_payment_method like '%transfer%' then v_payment_method:='bank_transfer';
     else v_payment_method:='other';
     end if;
     if exists(select 1 from public.tracker_payments where organization_id=p_organization_id
      and invoice_number=v_payment_invoice and paid_on=v_payment_date and amount=v_payment_amount
      and coalesce(reference,'')=coalesce(v_payment_ref,'')) then
       v_skipped:=v_skipped+1;continue;
     end if;
     select coalesce(sum(amount),0) into v_total_paid from public.tracker_payments
       where organization_id=p_organization_id and invoice_number=v_payment_invoice;
     if v_total_paid+v_payment_amount>v_total_due then
       v_flagged:=v_flagged+1;
       if jsonb_array_length(v_issues)<30 then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('reason','Payment exceeds invoice balance','invoice',v_payment_invoice));end if;
       continue;
     end if;
     insert into public.tracker_payments(organization_id,invoice_number,amount,paid_on,method,reference,notes)
     values(p_organization_id,v_payment_invoice,v_payment_amount,v_payment_date,v_payment_method,v_payment_ref,
       case when v_payment->>'payment_method' is null then 'Imported: payment method not supplied' else 'Imported from file' end);
     v_created:=v_created+1;
   end loop;
 v_previous:=jsonb_build_object('created',v_created,'updated',v_updated,
   'skipped',v_skipped,'flagged',v_flagged,'rows',jsonb_array_length(p_records),
   'issues',v_issues,'already_imported',false);
 insert into public.tracker_import_batches(organization_id,file_sha256,file_label,
   imported_count,updated_count,skipped_count,flagged_count,summary)
 values(p_organization_id,p_file_hash,p_file_label,v_created,v_updated,v_skipped,v_flagged,v_previous)
 returning id into v_batch;
 return v_previous||jsonb_build_object('batch_id',v_batch);
end $function$;

CREATE OR REPLACE FUNCTION public.tracker_compose_invoice(p_organization_id uuid, p_client_id uuid, p_number text, p_date date, p_due_date date, p_tax_rate numeric, p_items jsonb, p_work_ids uuid[], p_notes text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_invoice text;
 v_client uuid;
 v_snapshot uuid;
 v_count integer;
 v_first uuid;
 v_item jsonb;
 v_desc text;
 v_qty numeric;
 v_rate numeric;
 v_amount numeric;
 v_subtotal numeric:=0;
 v_tax numeric;
 v_grand numeric;
 v_row_order integer;
begin
 if not (select private.is_workspace_member()) then raise exception 'Access denied';end if;
 v_invoice:=btrim(coalesce(p_number,''));
 if p_organization_id is null or v_invoice !~ '^[A-Za-z0-9-]{1,48}$' or p_date is null
    or p_tax_rate is null or p_tax_rate<0 or p_tax_rate>100 then
  raise exception 'Invoice fields are invalid';
 end if;
 if p_due_date is not null and p_due_date<p_date then raise exception 'Due date precedes issue date';end if;
 if p_client_id is null or not exists(select 1 from public.tracker_clients
   where id=p_client_id and organization_id=p_organization_id) then
  raise exception 'Choose a client belonging to this organisation';
 end if;
 if jsonb_typeof(p_items)<>'array' or coalesce(jsonb_array_length(p_items),0)>50
    or coalesce(cardinality(p_work_ids),0)>100
    or (jsonb_array_length(p_items)=0 and coalesce(cardinality(p_work_ids),0)=0) then
  raise exception 'An invoice needs at least one line item';
 end if;
 if cardinality(coalesce(p_work_ids,'{}'::uuid[]))<>(select count(distinct x) from unnest(p_work_ids) x) then
  raise exception 'Work contains duplicates';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('tracker:invoice:'||p_organization_id::text||':'||lower(v_invoice),0));
 if exists(select 1 from public.tracker_rows
   where organization_id=p_organization_id and lower(invoice_number)=lower(v_invoice)) then
  raise exception 'Invoice number is already in use for this organisation';
 end if;
 select id into v_snapshot from public.tracker_snapshots where organization_id=p_organization_id for update;
 if v_snapshot is null then raise exception 'Organisation workspace is not initialized';end if;
 perform id from public.tracker_rows where id=any(p_work_ids) and organization_id=p_organization_id order by id for update;
 select count(*),coalesce(sum(amount),0),(array_agg(id order by id))[1] into v_count,v_subtotal,v_first
 from public.tracker_rows where id=any(p_work_ids) and organization_id=p_organization_id
 and invoice_number is null and (client_id is null or client_id=p_client_id)
 and amount is not null and work_status<>'archived';
 if v_count<>coalesce(cardinality(p_work_ids),0) then
  raise exception 'Selected work has changed or belongs to a different client';
 end if;
 select coalesce(max(row_order),0) into v_row_order from public.tracker_rows where organization_id=p_organization_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_desc:=btrim(coalesce(v_item->>'description',''));
  begin
   v_qty:=(v_item->>'quantity')::numeric;
   v_rate:=(v_item->>'rate')::numeric;
  exception when others then raise exception 'Use numeric quantities and rates';end;
  if length(v_desc)<2 or length(v_desc)>500 or v_qty is null or v_qty<=0
     or v_qty>100000 or v_rate is null or v_rate<0 or v_rate>100000000000 then
   raise exception 'Invalid invoice line item';
  end if;
  v_amount:=round(v_qty*v_rate,2);
  v_subtotal:=v_subtotal+v_amount;
  v_row_order:=v_row_order+1;
  insert into public.tracker_rows(
    organization_id,snapshot_id,client_id,row_order,project_name,assigned_by,
    amount,quantity,unit_price,invoice_number,work_status,source_kind,from_source_pdf)
  values(p_organization_id,v_snapshot,p_client_id,v_row_order,v_desc,null,
    v_amount,v_qty,v_rate,v_invoice,'open','created_in_app',false)
  returning id into v_client;
  if v_first is null then v_first:=v_client;end if;
 end loop;
 if v_first is null then raise exception 'Invoice has no rows';end if;
 v_tax:=round(v_subtotal*p_tax_rate/100,2);
 v_grand:=v_subtotal+v_tax;
 if v_grand>1000000000000 then raise exception 'Invoice total is too large';end if;
 update public.tracker_rows set invoice_number=v_invoice,
   client_id=coalesce(client_id,p_client_id),updated_at=now()
 where id=any(p_work_ids) and organization_id=p_organization_id;
 update public.tracker_rows set invoice_printed_total=v_grand,
   invoice_date=p_date,invoice_due_date=p_due_date,invoice_tax_rate=p_tax_rate,
   invoice_tax_amount=v_tax,invoice_public_notes=nullif(btrim(coalesce(p_notes,'')),''),
   invoice_state='Draft',payment_state='Unpaid',updated_at=now()
 where id=v_first;
 return v_invoice;
end $function$;

CREATE OR REPLACE FUNCTION public.tracker_compose_and_mark_invoice(p_organization_id uuid, p_client_id uuid, p_number text, p_date date, p_due_date date, p_tax_rate numeric, p_items jsonb, p_work_ids uuid[], p_notes text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_number text;
begin
 if not (select private.is_workspace_member()) then raise exception 'Access denied';end if;
 v_number:=public.tracker_compose_invoice(p_organization_id,p_client_id,p_number,
  p_date,p_due_date,p_tax_rate,p_items,p_work_ids,p_notes);
 update public.tracker_rows
 set invoice_created_in_app=true
 where organization_id=p_organization_id and invoice_number=v_number
 and invoice_printed_total is not null;
 if not found then raise exception 'Failed to mark invoice ownership';end if;
 return v_number;
end $function$;

CREATE OR REPLACE FUNCTION public.tracker_edit_invoice(p_organization_id uuid, p_number text, p_issue_date date, p_due_date date, p_notes text, p_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_first uuid;
begin
 if not (select private.is_workspace_member()) then raise exception 'Access denied';end if;
 if p_issue_date is null or (p_due_date is not null and p_due_date<p_issue_date)
    or p_status not in ('Draft','Sent') then raise exception 'Invalid invoice details';end if;
 perform pg_advisory_xact_lock(hashtextextended('tracker:invoice:'||p_organization_id::text||':'||lower(p_number),0));
 select id into v_first from public.tracker_rows
 where organization_id=p_organization_id and invoice_number=p_number and invoice_printed_total is not null
 and invoice_created_in_app=true limit 1 for update;
 if v_first is null then raise exception 'Only app-created invoices can be edited';end if;
 if exists(select 1 from public.tracker_payments where organization_id=p_organization_id and invoice_number=p_number)
 then raise exception 'Paid invoices cannot be edited';end if;
 update public.tracker_rows set invoice_date=p_issue_date,invoice_due_date=p_due_date,
   invoice_public_notes=nullif(btrim(coalesce(p_notes,'')),''),
   invoice_state=p_status,updated_at=now()
 where id=v_first;
 return true;
end $function$;


drop trigger if exists tracker_rows_org_links on public.tracker_rows;
create trigger tracker_rows_org_links before insert or update of organization_id,snapshot_id,client_id
on public.tracker_rows for each row execute function public.tracker_validate_org_links();

drop trigger if exists tracker_payments_validate on public.tracker_payments;
create trigger tracker_payments_validate before insert or update
on public.tracker_payments for each row execute function public.tracker_validate_payment();

revoke all on function public.tracker_create_organisation_invoice(uuid,text,date,numeric,uuid[]) from public,anon;
grant execute on function public.tracker_create_organisation_invoice(uuid,text,date,numeric,uuid[]) to authenticated;
revoke all on function public.tracker_apply_import(uuid,text,text,jsonb) from public,anon;
grant execute on function public.tracker_apply_import(uuid,text,text,jsonb) to authenticated;
revoke all on function public.tracker_compose_invoice(uuid,uuid,text,date,date,numeric,jsonb,uuid[],text) from public,anon;
grant execute on function public.tracker_compose_invoice(uuid,uuid,text,date,date,numeric,jsonb,uuid[],text) to authenticated;
revoke all on function public.tracker_compose_and_mark_invoice(uuid,uuid,text,date,date,numeric,jsonb,uuid[],text) from public,anon;
grant execute on function public.tracker_compose_and_mark_invoice(uuid,uuid,text,date,date,numeric,jsonb,uuid[],text) to authenticated;
revoke all on function public.tracker_edit_invoice(uuid,text,date,date,text,text) from public,anon;
grant execute on function public.tracker_edit_invoice(uuid,text,date,date,text,text) to authenticated;
-- The old single-organisation invoice RPC is deliberately unavailable to clients.
revoke all on function public.tracker_create_invoice(text,date,numeric,uuid[]) from authenticated;

insert into public.tracker_organizations(name,status)
values ('Kumar Aman','active'),('The Minimical Co.','active'),
('Enchated Vows','active'),('Smilebox Studios','dissolved')
on conflict(name) do nothing;
insert into public.tracker_snapshots(
 organization_id,source_title,source_file_name,owner_name,balance_as_of,reported_pending
)
select id,'No opening records','',name,current_date,0
from public.tracker_organizations o
where not exists(select 1 from public.tracker_snapshots s where s.organization_id=o.id);

-- Audited, organisation-scoped invoice revisions.
-- Never edits paid/source-settled invoices; line totals/tax are recalculated atomically.
create table if not exists public.tracker_invoice_revisions(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.tracker_organizations(id) on delete cascade,
 invoice_number text not null,
 actor_id uuid not null default auth.uid(),
 before_record jsonb not null,
 after_record jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.tracker_invoice_revisions enable row level security;
revoke all on public.tracker_invoice_revisions from public,anon;
grant select,insert on public.tracker_invoice_revisions to authenticated;
drop policy if exists "workspace revision history" on public.tracker_invoice_revisions;
create policy "workspace revision history" on public.tracker_invoice_revisions
 for select to authenticated using ((select private.is_workspace_member()));
drop policy if exists "workspace revision insert" on public.tracker_invoice_revisions;
create policy "workspace revision insert" on public.tracker_invoice_revisions
 for insert to authenticated with check (
   (select private.is_workspace_member()) and actor_id=(select auth.uid()));
create index if not exists tracker_invoice_revisions_org_invoice
 on public.tracker_invoice_revisions(organization_id,invoice_number,created_at desc);

CREATE OR REPLACE FUNCTION public.tracker_revise_invoice(p_organization_id uuid, p_number text, p_client_id uuid, p_issue_date date, p_due_date date, p_tax_rate numeric, p_status text, p_notes text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_existing integer;
 v_id uuid;
 v_snapshot uuid;
 v_first uuid;
 v_ids uuid[]:='{}'::uuid[];
 v_item jsonb;
 v_name text;
 v_quantity numeric;
 v_rate numeric;
 v_amount numeric;
 v_subtotal numeric:=0;
 v_tax numeric;
 v_total numeric;
 v_row_order integer;
 v_before jsonb;
 v_after jsonb;
begin
 if not (select private.is_workspace_member()) then raise exception 'Access denied';end if;
 if p_organization_id is null or p_number is null or p_number !~ '^[A-Za-z0-9-]{1,48}$'
 or p_issue_date is null or (p_due_date is not null and p_due_date<p_issue_date)
 or p_tax_rate is null or p_tax_rate<0 or p_tax_rate>100 or p_status not in ('Draft','Sent')
 or p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100
 or length(coalesce(p_notes,''))>4000 then raise exception 'Invalid invoice details';end if;
 if not exists(select 1 from public.tracker_clients
   where id=p_client_id and organization_id=p_organization_id)
 then raise exception 'Client is not in this organisation';end if;
 perform pg_advisory_xact_lock(hashtextextended('tracker:invoice:'||p_organization_id::text||':'||lower(p_number),0));
 perform id from public.tracker_rows
  where organization_id=p_organization_id and invoice_number=p_number
  order by id for update;
 select count(*),jsonb_agg(to_jsonb(r) order by row_order) into v_existing,v_before
 from public.tracker_rows r where organization_id=p_organization_id and invoice_number=p_number;
 if v_existing<1 then raise exception 'Invoice not found';end if;
 if exists(select 1 from public.tracker_rows where organization_id=p_organization_id and invoice_number=p_number
  and source_paid=true) or exists(select 1 from public.tracker_payments
  where organization_id=p_organization_id and invoice_number=p_number)
 then raise exception 'This invoice has payments and cannot be repriced. Create a separate adjustment.';end if;
 select id into v_snapshot from public.tracker_snapshots where organization_id=p_organization_id;
 if v_snapshot is null then raise exception 'Organisation snapshot is missing';end if;
 select coalesce(max(row_order),0) into v_row_order from public.tracker_rows where organization_id=p_organization_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
   if jsonb_typeof(v_item)<>'object' then raise exception 'Invalid invoice item';end if;
   v_name:=btrim(coalesce(v_item->>'description',''));
   begin
    v_quantity:=(v_item->>'quantity')::numeric;
    v_rate:=(v_item->>'rate')::numeric;
   exception when others then raise exception 'Quantities and rates must be numbers';end;
   if length(v_name)<2 or length(v_name)>500 or v_quantity is null or v_quantity<=0 or v_quantity>100000
    or v_rate is null or v_rate<0 or v_rate>100000000000 then raise exception 'Invalid invoice item';end if;
   v_amount:=round(v_quantity*v_rate,2);
   v_subtotal:=v_subtotal+v_amount;
   if nullif(btrim(coalesce(v_item->>'id','')),'') is not null then
     begin v_id:=(v_item->>'id')::uuid;
     exception when others then raise exception 'Invalid work item identity';end;
     if v_id=any(v_ids) then raise exception 'Duplicate line item';end if;
     if not exists(select 1 from public.tracker_rows
       where id=v_id and organization_id=p_organization_id and invoice_number=p_number)
     then raise exception 'Invoice line was moved or deleted';end if;
     update public.tracker_rows set project_name=v_name,quantity=v_quantity,
       unit_price=v_rate,amount=v_amount,client_id=p_client_id,updated_at=now()
       where id=v_id and organization_id=p_organization_id;
   else
     v_row_order:=v_row_order+1;
     insert into public.tracker_rows(organization_id,snapshot_id,client_id,row_order,project_name,
       amount,quantity,unit_price,invoice_number,source_kind,work_status,from_source_pdf)
     values(p_organization_id,v_snapshot,p_client_id,v_row_order,v_name,v_amount,
       v_quantity,v_rate,p_number,'invoice_line','open',false) returning id into v_id;
   end if;
   v_ids:=array_append(v_ids,v_id);
 end loop;
 if v_subtotal>1000000000000 then raise exception 'Invoice value exceeds allowed limit';end if;
 v_tax:=round(v_subtotal*p_tax_rate/100,2);
 v_total:=v_subtotal+v_tax;
 if v_total>1000000000000 then raise exception 'Invoice value exceeds allowed limit';end if;
 update public.tracker_rows set invoice_number=null,invoice_date=null,invoice_due_date=null,
   invoice_printed_total=null,invoice_tax_rate=null,invoice_tax_amount=null,invoice_public_notes=null,
   invoice_state=null,invoice_created_in_app=false,updated_at=now()
 where organization_id=p_organization_id and invoice_number=p_number and not(id=any(v_ids));
 update public.tracker_rows set invoice_date=null,invoice_due_date=null,invoice_printed_total=null,
   invoice_tax_rate=null,invoice_tax_amount=null,invoice_public_notes=null,
   invoice_state=null,invoice_created_in_app=false,updated_at=now()
 where organization_id=p_organization_id and invoice_number=p_number and id=any(v_ids);
 v_first:=v_ids[1];
 update public.tracker_rows set invoice_printed_total=v_total,invoice_date=p_issue_date,
   invoice_due_date=p_due_date,invoice_tax_rate=p_tax_rate,invoice_tax_amount=v_tax,
   invoice_public_notes=nullif(btrim(coalesce(p_notes,'')),''),invoice_state=p_status,
   payment_state='Unpaid',invoice_created_in_app=true,updated_at=now()
 where id=v_first and organization_id=p_organization_id;
 select jsonb_agg(to_jsonb(r) order by row_order) into v_after
  from public.tracker_rows r where organization_id=p_organization_id and invoice_number=p_number;
 insert into public.tracker_invoice_revisions(organization_id,invoice_number,before_record,after_record)
 values(p_organization_id,p_number,v_before,v_after);
 return jsonb_build_object('ok',true,'number',p_number,'subtotal',v_subtotal,'tax',v_tax,
   'total',v_total,'items',cardinality(v_ids));
end $function$;

revoke all on function public.tracker_revise_invoice(uuid,text,uuid,date,date,numeric,text,text,jsonb) from public,anon;
grant execute on function public.tracker_revise_invoice(uuid,text,uuid,date,date,numeric,text,text,jsonb) to authenticated;

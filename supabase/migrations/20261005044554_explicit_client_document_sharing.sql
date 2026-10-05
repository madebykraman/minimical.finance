CREATE OR REPLACE FUNCTION public.issue_invoice(p_invoice_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  inv public.invoices%rowtype;
  total numeric;
  next_version integer;
  snap jsonb;
  snap_hash text;
  actor uuid;
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if inv.id is null then raise exception 'Invoice not found'; end if;
  if inv.status <> 'draft' then raise exception 'Only draft invoices can be issued'; end if;

  select coalesce(sum(case when priced then coalesce(amount, quantity * coalesce(rate,0)) else 0 end),0)
    into total
  from public.invoice_contents
  where invoice_id = inv.id;

  if total <= 0 then raise exception 'Invoice must have a positive total before it can be issued'; end if;
  if inv.client_id is null then raise exception 'Invoice client is required before issue'; end if;

  snap := public.invoice_snapshot(inv.id);
  snap_hash := encode(digest(snap::text, 'sha256'), 'hex');

  select coalesce(max(version_number),0)+1 into next_version
  from public.invoice_versions
  where invoice_id = inv.id;

  select auth.uid() into actor;

  insert into public.invoice_versions(invoice_id, organization_id, version_number, snapshot, snapshot_hash, created_by)
  values(inv.id, inv.organization_id, next_version, snap, snap_hash, actor);

  update public.invoices
  set status = 'sent',
      source_total = total,
      issued_at = now(),
      issued_version = next_version,
      updated_at = now()
  where id = inv.id;

  insert into public.documents(
    invoice_id, client_id, organization_id, document_type, file_path, file_name,
    visible_to_client, description, mime_type, status, version_number, template_key, source_hash, issued_at
  )
  select inv.id, inv.client_id, inv.organization_id, 'invoice_pdf', '', 'INV_' || inv.invoice_number || '.pdf',
         false, 'Canonical issued invoice', 'application/pdf', 'pending', next_version,
         o.invoice_template_key, snap_hash, now()
  from public.organizations o
  where o.id = inv.organization_id
  on conflict (invoice_id, document_type, version_number) where invoice_id is not null do nothing;

  insert into public.activity_log(invoice_id, action, metadata)
  values(inv.id, 'invoice_issued', jsonb_build_object(
    'version_number', next_version,
    'snapshot_hash', snap_hash,
    'issued_at', now()
  ));

  return next_version;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_invoice_payment(p_invoice_id uuid, p_amount numeric, p_payment_date date, p_method payment_method, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare new_payment_id uuid; new_payment record; inv_org uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  select organization_id into inv_org from public.invoices where id=p_invoice_id for update;
  if inv_org is null then raise exception 'Invoice not found'; end if;

  insert into public.payments(invoice_id,amount,payment_date,method,reference,notes,organization_id)
  values(p_invoice_id,p_amount,p_payment_date,p_method,nullif(trim(p_reference),''),nullif(trim(p_notes),''),inv_org)
  returning * into new_payment;

  insert into public.documents(invoice_id,client_id,organization_id,payment_id,document_type,file_path,file_name,visible_to_client,description,mime_type,status,version_number,issued_at)
  select p_invoice_id,i.client_id,inv_org,new_payment.id,'receipt_pdf','',
         'Receipt-'||coalesce(new_payment.receipt_number,new_payment.id::text)||'.pdf',
         false,'Canonical payment receipt','application/pdf','pending',1,coalesce(new_payment.receipt_issued_at,now())
  from public.invoices i where i.id=p_invoice_id
  on conflict (payment_id,document_type,version_number) where payment_id is not null and document_type='receipt_pdf' do nothing;

  insert into public.activity_log(invoice_id,action,metadata)
  values(p_invoice_id,'payment_recorded',jsonb_build_object(
    'payment_id',new_payment.id,'amount',p_amount,'payment_date',p_payment_date,
    'method',p_method,'reference',p_reference,'receipt_number',new_payment.receipt_number
  ));
  return new_payment.id;
end;
$function$
;

update public.documents
set visible_to_client=false
where document_type in ('invoice_pdf','receipt_pdf')
  and visible_to_client is true;

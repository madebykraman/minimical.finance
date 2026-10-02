create or replace function public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method public.payment_method,
  p_reference text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_payment_id uuid;
  new_payment record;
  inv_org uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  select organization_id into inv_org from public.invoices where id=p_invoice_id for update;
  if inv_org is null then raise exception 'Invoice not found'; end if;

  insert into public.payments(invoice_id,amount,payment_date,method,reference,notes,organization_id)
  values(p_invoice_id,p_amount,p_payment_date,p_method,nullif(trim(p_reference),''),nullif(trim(p_notes),''),inv_org)
  returning * into new_payment;

  insert into public.documents(invoice_id,client_id,organization_id,document_type,file_path,file_name,visible_to_client,description,mime_type,status,version_number,issued_at)
  select p_invoice_id,i.client_id,inv_org,'receipt_pdf','',
         'Receipt-'||coalesce(new_payment.receipt_number,new_payment.id::text)||'.pdf',
         true,'Canonical payment receipt','application/pdf','pending',1,coalesce(new_payment.receipt_issued_at,now())
  from public.invoices i where i.id=p_invoice_id
  on conflict (invoice_id,document_type,version_number) where invoice_id is not null do nothing;

  insert into public.activity_log(invoice_id,action,metadata)
  values(p_invoice_id,'payment_recorded',jsonb_build_object(
    'payment_id',new_payment.id,'amount',p_amount,'payment_date',p_payment_date,
    'method',p_method,'reference',p_reference,'receipt_number',new_payment.receipt_number
  ));
  return new_payment.id;
end;
$$;
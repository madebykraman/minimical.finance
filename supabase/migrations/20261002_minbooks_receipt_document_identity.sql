begin;

alter table public.documents add column if not exists payment_id uuid references public.payments(id);
create index if not exists documents_payment_id_idx on public.documents(payment_id);

drop index if exists documents_invoice_type_version_uidx;
create unique index if not exists documents_invoice_type_version_uidx
  on public.documents(invoice_id,document_type,version_number)
  where invoice_id is not null and document_type <> 'receipt_pdf';

create unique index if not exists documents_payment_type_version_uidx
  on public.documents(payment_id,document_type,version_number)
  where payment_id is not null and document_type = 'receipt_pdf';

delete from public.documents where document_type='receipt_pdf';

insert into public.documents(invoice_id,client_id,organization_id,payment_id,document_type,file_path,file_name,visible_to_client,description,mime_type,status,version_number,issued_at)
select p.invoice_id,i.client_id,p.organization_id,p.id,'receipt_pdf','',
       'Receipt-'||coalesce(p.receipt_number,p.id::text)||'.pdf',true,'Canonical payment receipt','application/pdf','pending',1,p.receipt_issued_at
from public.payments p join public.invoices i on i.id=p.invoice_id;

commit;
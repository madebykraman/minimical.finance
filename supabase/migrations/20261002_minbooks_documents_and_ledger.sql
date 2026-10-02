-- MinBooks document, issuance and ledger layer
-- Canonical issued snapshots, organisation-scoped receipts, document versions and statement ledger.

begin;

alter table public.organizations
  add column if not exists receipt_prefix text not null default '',
  add column if not exists next_receipt_number integer not null default 1;

alter table public.invoices
  add column if not exists issued_at timestamptz,
  add column if not exists issued_version integer;

alter table public.payments
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists receipt_issued_at timestamptz;

update public.payments p
set organization_id = i.organization_id
from public.invoices i
where p.invoice_id = i.id
  and p.organization_id is null;

create index if not exists payments_organization_date_idx
  on public.payments (organization_id, payment_date desc);

create unique index if not exists payments_organization_receipt_uidx
  on public.payments (organization_id, receipt_number)
  where receipt_number is not null;

create table if not exists public.invoice_versions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  version_number integer not null,
  snapshot jsonb not null,
  snapshot_hash text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint invoice_versions_invoice_version_uidx unique (invoice_id, version_number)
);

create index if not exists invoice_versions_org_created_idx
  on public.invoice_versions (organization_id, created_at desc);

alter table public.documents
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists version_number integer not null default 1,
  add column if not exists status text not null default 'pending',
  add column if not exists template_key text,
  add column if not exists source_hash text,
  add column if not exists generated_at timestamptz,
  add column if not exists issued_at timestamptz,
  add column if not exists checksum_sha256 text;

update public.documents d
set organization_id = i.organization_id
from public.invoices i
where d.invoice_id = i.id
  and d.organization_id is null;

create index if not exists documents_org_created_idx
  on public.documents (organization_id, created_at desc);

create unique index if not exists documents_invoice_type_version_uidx
  on public.documents (invoice_id, document_type, version_number)
  where invoice_id is not null;

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number integer not null,
  file_path text,
  file_name text,
  storage_bucket text not null default 'finos-documents',
  mime_type text not null default 'application/pdf',
  size_bytes bigint,
  checksum_sha256 text,
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  constraint document_versions_document_version_uidx unique (document_id, version_number)
);

create index if not exists document_versions_document_created_idx
  on public.document_versions (document_id, generated_at desc);

create index if not exists document_versions_generated_by_idx
  on public.document_versions (generated_by);

create index if not exists invoice_versions_created_by_idx
  on public.invoice_versions (created_by);

do $
declare r record; n text;
begin
  for r in
    select p.id, p.organization_id
    from public.payments p
    where p.receipt_number is null
    order by p.created_at, p.id
  loop
    n := public.allocate_receipt_number(r.organization_id);
    update public.payments
    set receipt_number=n, receipt_issued_at=coalesce(receipt_issued_at,created_at)
    where id=r.id;
  end loop;
end $;

create or replace function public.allocate_receipt_number(p_organization_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare next_no integer; prefix text; result text;
begin
  if p_organization_id is null then raise exception 'Organisation is required for receipt numbering'; end if;
  select next_receipt_number, coalesce(receipt_prefix, '') into next_no, prefix
  from public.organizations where id = p_organization_id for update;
  if next_no is null then raise exception 'Organisation not found'; end if;
  result := prefix || lpad(next_no::text, 4, '0');
  update public.organizations set next_receipt_number = next_no + 1, updated_at = now() where id = p_organization_id;
  return result;
end;
$$;

create or replace function public.sync_payment_organization()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare invoice_org uuid;
begin
  select organization_id into invoice_org from public.invoices where id = new.invoice_id;
  if invoice_org is null then raise exception 'Payment invoice organisation could not be resolved'; end if;
  if new.organization_id is null then new.organization_id := invoice_org;
  elsif new.organization_id <> invoice_org then raise exception 'Payment organisation must match invoice organisation'; end if;
  if tg_op = 'INSERT' then
    new.receipt_number := public.allocate_receipt_number(invoice_org);
    new.receipt_issued_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists payments_sync_organization on public.payments;
create trigger payments_sync_organization
before insert or update of invoice_id, organization_id on public.payments
for each row execute function public.sync_payment_organization();

do $
declare r record; snap jsonb; h text; v integer;
begin
  for r in
    select i.id, i.organization_id
    from public.invoices i
    where i.status <> 'draft'
      and not exists (select 1 from public.invoice_versions iv where iv.invoice_id=i.id)
  loop
    snap := public.invoice_snapshot(r.id);
    h := encode(digest(snap::text,'sha256'),'hex');
    v := 1;
    insert into public.invoice_versions(invoice_id,organization_id,version_number,snapshot,snapshot_hash)
    values(r.id,r.organization_id,v,snap,h);
    update public.invoices
    set issued_at=coalesce(issued_at,created_at), issued_version=coalesce(issued_version,v)
    where id=r.id;
  end loop;
end $;

create or replace function public.invoice_snapshot(p_invoice_id uuid)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'invoice', to_jsonb(i),
    'organization', to_jsonb(o),
    'client', to_jsonb(c),
    'project', to_jsonb(p),
    'contents', coalesce((select jsonb_agg(to_jsonb(ic) order by ic.position, ic.created_at) from public.invoice_contents ic where ic.invoice_id = i.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(py) order by py.payment_date, py.created_at) from public.payments py where py.invoice_id = i.id), '[]'::jsonb)
  )
  from public.invoices i
  left join public.organizations o on o.id = i.organization_id
  left join public.clients c on c.id = i.client_id
  left join public.projects p on p.id = i.project_id
  where i.id = p_invoice_id;
$$;

create or replace function public.issue_invoice(p_invoice_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare inv public.invoices%rowtype; total numeric; next_version integer; snap jsonb; snap_hash text; actor uuid;
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if inv.id is null then raise exception 'Invoice not found'; end if;
  if inv.status <> 'draft' then raise exception 'Only draft invoices can be issued'; end if;
  select coalesce(sum(case when priced then coalesce(amount, quantity * coalesce(rate,0)) else 0 end),0) into total
  from public.invoice_contents where invoice_id = inv.id;
  if total <= 0 then raise exception 'Invoice must have a positive total before it can be issued'; end if;
  if inv.client_id is null then raise exception 'Invoice client is required before issue'; end if;
  snap := public.invoice_snapshot(inv.id);
  snap_hash := encode(digest(snap::text, 'sha256'), 'hex');
  select coalesce(max(version_number),0)+1 into next_version from public.invoice_versions where invoice_id = inv.id;
  select auth.uid() into actor;
  insert into public.invoice_versions(invoice_id, organization_id, version_number, snapshot, snapshot_hash, created_by)
  values(inv.id, inv.organization_id, next_version, snap, snap_hash, actor);
  update public.invoices set status='sent', source_total=total, issued_at=now(), issued_version=next_version, updated_at=now() where id=inv.id;
  insert into public.documents(invoice_id, client_id, organization_id, document_type, file_path, file_name, visible_to_client, description, mime_type, status, version_number, template_key, source_hash, issued_at)
  select inv.id, inv.client_id, inv.organization_id, 'invoice_pdf', '', 'INV_'||inv.invoice_number||'.pdf', true, 'Canonical issued invoice', 'application/pdf', 'pending', next_version, o.invoice_template_key, snap_hash, now()
  from public.organizations o where o.id=inv.organization_id
  on conflict (invoice_id, document_type, version_number) where invoice_id is not null do nothing;
  insert into public.activity_log(invoice_id, action, metadata)
  values(inv.id,'invoice_issued',jsonb_build_object('version_number',next_version,'snapshot_hash',snap_hash,'issued_at',now()));
  return next_version;
end;
$$;

insert into public.documents(invoice_id,client_id,organization_id,document_type,file_path,file_name,visible_to_client,description,mime_type,status,version_number,template_key,source_hash,issued_at)
select i.id,i.client_id,i.organization_id,'invoice_pdf','', 'INV_'||i.invoice_number||'.pdf',true,'Canonical issued invoice','application/pdf','pending',iv.version_number,o.invoice_template_key,iv.snapshot_hash,i.issued_at
from public.invoices i
join public.invoice_versions iv on iv.invoice_id=i.id and iv.version_number=i.issued_version
join public.organizations o on o.id=i.organization_id
where i.status<>'draft'
on conflict (invoice_id,document_type,version_number) where invoice_id is not null do nothing;

create or replace function public.statement_ledger(p_client_id uuid, p_start date default '2000-01-01', p_end date default '2100-12-31')
returns table(transaction_date date, transaction_type text, reference text, debit numeric, credit numeric, running_balance numeric)
language sql
security invoker
set search_path = public
as $$
  with tx as (
    select i.issue_date transaction_date, 'invoice'::text transaction_type, '#'||i.invoice_number reference,
           coalesce(i.source_total,0)::numeric debit, 0::numeric credit
    from public.invoices i
    where i.client_id=p_client_id and i.issue_date<=p_end and i.status<>'void'
    union all
    select p.payment_date, 'payment'::text, coalesce(p.receipt_number,p.id::text), 0::numeric, p.amount::numeric
    from public.payments p join public.invoices i on i.id=p.invoice_id
    where i.client_id=p_client_id and p.payment_date is not null and p.payment_date<=p_end
  ), opening as (
    select coalesce(sum(debit-credit) filter(where transaction_date<p_start),0) value from tx
  )
  select t.transaction_date,t.transaction_type,t.reference,t.debit,t.credit,
    (select value from opening)+sum(t.debit-t.credit) over(order by t.transaction_date,t.transaction_type,t.reference rows between unbounded preceding and current row)
  from tx t
  where t.transaction_date>=p_start
  order by t.transaction_date,t.transaction_type,t.reference;
$$;

commit;
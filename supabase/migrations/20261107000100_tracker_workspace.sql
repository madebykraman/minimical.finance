-- PDF-ledger schema for the 2026-11-07 rebuild.
-- Independent installation supports the new tracker without legacy migrations.
create schema if not exists private;
create table if not exists public.workspace_members(
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.workspace_members enable row level security;
revoke all on public.workspace_members from anon;
grant select on public.workspace_members to authenticated;
drop policy if exists "member self read" on public.workspace_members;
create policy "member self read" on public.workspace_members for select to authenticated using (user_id=(select auth.uid()));
do $fn$
begin
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname='is_workspace_member') then
 execute $sql$create function private.is_workspace_member() returns boolean
 language sql stable security definer set search_path=public,pg_temp
 as 'select exists(select 1 from public.workspace_members where user_id = auth.uid())'$sql$;
 end if;
end $fn$;
revoke all on function private.is_workspace_member() from public,anon;
grant execute on function private.is_workspace_member() to authenticated;
insert into storage.buckets(id,name,public) values('finos-documents','finos-documents',false)
on conflict(id) do nothing;

-- Authentication + workspace_membership remain in the existing Supabase project.
create table if not exists public.tracker_snapshots(
  id uuid primary key default gen_random_uuid(),
  source_title text not null,
  source_file_name text not null,
  owner_name text not null,
  balance_as_of date not null,
  reported_pending numeric(14,2) not null check(reported_pending>=0),
  created_at timestamptz not null default now()
);
create table if not exists public.tracker_clients(
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(trim(name))>0),
  email text, phone text, notes text,
  from_source_pdf boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.tracker_rows(
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.tracker_snapshots(id) on delete cascade,
  row_order integer not null check(row_order>0),
  project_name text not null check(length(trim(project_name))>0),
  assigned_by text,
  amount numeric(14,2) check(amount is null or amount>=0),
  payment_state text,
  invoice_number text,
  invoice_date date,
  invoice_printed_total numeric(14,2) check(invoice_printed_total is null or invoice_printed_total>=0),
  invoice_state text,
  invoice_pdf_name text,
  payment_date date,
  client_id uuid references public.tracker_clients(id) on delete set null,
  work_status text not null default 'open' check(work_status in ('open','complete','archived')),
  notes text,
  from_source_pdf boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(snapshot_id,row_order)
);
alter table public.tracker_rows add column if not exists client_id uuid references public.tracker_clients(id) on delete set null;
create table if not exists public.tracker_payments(
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  amount numeric(14,2) not null check(amount>0),
  paid_on date not null,
  method text not null default 'bank_transfer' check(method in ('bank_transfer','upi','cash','card','other')),
  reference text,notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.tracker_documents(
  id uuid primary key default gen_random_uuid(),
  file_name text not null, storage_path text not null unique,
  mime_type text not null, size_bytes bigint not null check(size_bytes>=0),
  invoice_number text,
  client_id uuid references public.tracker_clients(id) on delete set null,
  visible_to_client boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.tracker_portal_access(
  id boolean primary key default true check(id),
  password_hash text,
  enabled boolean not null default false,
  failed_count integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.tracker_portal_sessions(
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists tracker_rows_invoice_number_idx on public.tracker_rows(invoice_number);
create index if not exists tracker_rows_client_idx on public.tracker_rows(client_id);
create index if not exists tracker_rows_snapshot_order_idx on public.tracker_rows(snapshot_id,row_order);
create index if not exists tracker_payments_invoice_idx on public.tracker_payments(invoice_number);
create index if not exists tracker_documents_client_idx on public.tracker_documents(client_id);
do $$
declare t text;
begin
  foreach t in array array['tracker_snapshots','tracker_rows','tracker_clients','tracker_payments','tracker_documents'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
    execute format('drop policy if exists "workspace only" on public.%I',t);
    execute format('create policy "workspace only" on public.%I for all to authenticated using ((select private.is_workspace_member())) with check ((select private.is_workspace_member()))',t);
  end loop;
end $$;
alter table public.tracker_portal_access enable row level security;
alter table public.tracker_portal_sessions enable row level security;
revoke all on public.tracker_portal_access from anon,authenticated;
revoke all on public.tracker_portal_sessions from anon,authenticated;
insert into public.tracker_portal_access(id,enabled) values(true,false) on conflict(id) do nothing;

create or replace function public.tracker_portal_login_attempt(p_correct boolean)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_access record;
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden'; end if;
  select * into v_access from public.tracker_portal_access where id=true for update;
  if not found or not v_access.enabled or v_access.password_hash is null then return false; end if;
  if v_access.locked_until is not null and v_access.locked_until>now() then return false; end if;
  if p_correct then
    update public.tracker_portal_access set failed_count=0,locked_until=null,updated_at=now() where id=true;
    return true;
  end if;
  update public.tracker_portal_access set
    failed_count=case when failed_count>=5 then 1 else failed_count+1 end,
    locked_until=case when failed_count+1>=5 then now()+interval '15 minutes' else null end,
    updated_at=now() where id=true;
  return false;
end $$;
revoke all on function public.tracker_portal_login_attempt(boolean) from public,anon,authenticated;
grant execute on function public.tracker_portal_login_attempt(boolean) to service_role;

create or replace function public.tracker_create_invoice(p_number text,p_date date,p_total numeric,p_row_ids uuid[])
returns text language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_first uuid;
declare v_rows integer;
begin
  if not (select private.is_workspace_member()) then raise exception 'Access denied'; end if;
  if p_number is null or length(trim(p_number))<1 or p_total<0 or p_date is null
     or coalesce(array_length(p_row_ids,1),0)=0 then raise exception 'Invalid invoice'; end if;
  if exists(select 1 from public.tracker_rows where lower(invoice_number)=lower(p_number)) then
    raise exception 'Invoice number is already in use';
  end if;
  select count(*) into v_rows from public.tracker_rows where id=any(p_row_ids) and invoice_number is null;
  if v_rows<>array_length(p_row_ids,1) then raise exception 'Selected work is no longer available'; end if;
  v_first:=p_row_ids[1];
  update public.tracker_rows set invoice_number=p_number,invoice_printed_total=case when id=v_first then p_total else null end,
    invoice_date=case when id=v_first then p_date else null end,
    invoice_state=case when id=v_first then 'Draft' else null end,
    payment_state=case when id=v_first then 'Unpaid' else null end,updated_at=now()
  where id=any(p_row_ids) and invoice_number is null;
  if not found then raise exception 'No work assigned'; end if;
  return p_number;
end $$;
revoke all on function public.tracker_create_invoice(text,date,numeric,uuid[]) from public,anon;
grant execute on function public.tracker_create_invoice(text,date,numeric,uuid[]) to authenticated;

create or replace function public.tracker_validate_payment() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_total numeric;
declare v_paid numeric;
begin
 select max(invoice_printed_total) into v_total from public.tracker_rows where invoice_number=new.invoice_number;
 if v_total is null then raise exception 'Invoice group does not exist or has no printed total'; end if;
 select coalesce(sum(amount),0) into v_paid from public.tracker_payments
 where invoice_number=new.invoice_number and id is distinct from new.id;
 if v_paid+new.amount>v_total then raise exception 'Payment would exceed invoice balance'; end if;
 return new;
end $$;
drop trigger if exists tracker_payments_validate on public.tracker_payments;
create trigger tracker_payments_validate before insert or update on public.tracker_payments
for each row execute function public.tracker_validate_payment();

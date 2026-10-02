-- MinBooks financial-core integrity layer
-- Apply after the existing schema/RLS setup.

begin;

create unique index if not exists invoices_organization_invoice_number_uidx
  on public.invoices (organization_id, invoice_number);

create index if not exists clients_organization_name_idx
  on public.clients (organization_id, lower(name));

create index if not exists projects_organization_client_name_idx
  on public.projects (organization_id, client_id, lower(name));

create index if not exists invoices_organization_issue_date_idx
  on public.invoices (organization_id, issue_date desc);

create index if not exists payments_invoice_date_idx
  on public.payments (invoice_id, payment_date desc);

create or replace function public.validate_invoice_relationships()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  client_org uuid;
  project_org uuid;
  project_client uuid;
begin
  if new.client_id is not null then
    select organization_id into client_org
    from public.clients where id = new.client_id;

    if client_org is null or client_org <> new.organization_id then
      raise exception 'Invoice client must belong to the invoice organisation';
    end if;
  end if;

  if new.project_id is not null then
    select organization_id, client_id into project_org, project_client
    from public.projects where id = new.project_id;

    if project_org is null or project_org <> new.organization_id then
      raise exception 'Invoice project must belong to the invoice organisation';
    end if;

    if new.client_id is not null and project_client is not null and project_client <> new.client_id then
      raise exception 'Invoice project must belong to the selected invoice client';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_validate_relationships on public.invoices;
create trigger invoices_validate_relationships
before insert or update of organization_id, client_id, project_id
on public.invoices
for each row execute function public.validate_invoice_relationships();

create or replace function public.validate_project_relationships()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  client_org uuid;
begin
  if new.client_id is not null then
    select organization_id into client_org
    from public.clients where id = new.client_id;

    if client_org is null or client_org <> new.organization_id then
      raise exception 'Project client must belong to the project organisation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists projects_validate_relationships on public.projects;
create trigger projects_validate_relationships
before insert or update of organization_id, client_id
on public.projects
for each row execute function public.validate_project_relationships();

create or replace function public.validate_payment_amount()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  invoice_total numeric;
  already_paid numeric;
begin
  if new.amount is null or new.amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select coalesce(sum(case when priced then coalesce(amount, quantity * coalesce(rate,0)) else 0 end),0)
    into invoice_total
  from public.invoice_contents
  where invoice_id = new.invoice_id;

  select coalesce(sum(amount),0)
    into already_paid
  from public.payments
  where invoice_id = new.invoice_id
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if already_paid + new.amount > invoice_total then
    raise exception 'Payment exceeds invoice balance';
  end if;

  return new;
end;
$$;

drop trigger if exists payments_validate_amount on public.payments;
create trigger payments_validate_amount
before insert or update of amount, invoice_id
on public.payments
for each row execute function public.validate_payment_amount();

create or replace function public.sync_invoice_payment_status(p_invoice_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  invoice_total numeric;
  invoice_paid numeric;
  current_status public.invoice_status;
  next_status public.invoice_status;
begin
  select status into current_status from public.invoices where id = p_invoice_id for update;
  if current_status is null or current_status = 'void' then return; end if;

  select coalesce(sum(case when priced then coalesce(amount, quantity * coalesce(rate,0)) else 0 end),0)
    into invoice_total
  from public.invoice_contents where invoice_id = p_invoice_id;

  select coalesce(sum(amount),0)
    into invoice_paid
  from public.payments where invoice_id = p_invoice_id;

  next_status := case
    when invoice_paid <= 0 then
      case when current_status = 'draft' then 'draft' else 'sent' end
    when invoice_paid >= invoice_total and invoice_total > 0 then 'paid'
    else 'partially_paid'
  end;

  update public.invoices
  set status = next_status, updated_at = now()
  where id = p_invoice_id and status is distinct from next_status;
end;
$$;

create or replace function public.sync_invoice_payment_status_trigger()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform public.sync_invoice_payment_status(coalesce(new.invoice_id, old.invoice_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists payments_sync_invoice_status on public.payments;
create trigger payments_sync_invoice_status
after insert or update or delete on public.payments
for each row execute function public.sync_invoice_payment_status_trigger();

drop trigger if exists invoice_contents_sync_invoice_status on public.invoice_contents;
create trigger invoice_contents_sync_invoice_status
after insert or update or delete on public.invoice_contents
for each row execute function public.sync_invoice_payment_status_trigger();

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
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  insert into public.payments(invoice_id, amount, payment_date, method, reference, notes)
  values(p_invoice_id, p_amount, p_payment_date, p_method, nullif(trim(p_reference),''), nullif(trim(p_notes),''))
  returning id into new_payment_id;

  insert into public.activity_log(invoice_id, action, metadata)
  values(
    p_invoice_id,
    'payment_recorded',
    jsonb_build_object(
      'payment_id', new_payment_id,
      'amount', p_amount,
      'payment_date', p_payment_date,
      'method', p_method,
      'reference', p_reference
    )
  );

  return new_payment_id;
end;
$$;

commit;

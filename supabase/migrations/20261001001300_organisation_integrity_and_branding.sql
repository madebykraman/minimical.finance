-- Final organisation integrity and branding layer.
do $$
declare
  v_missing integer;
begin
  select count(*) into v_missing
  from public.invoices
  where organization_id is null;
  if v_missing > 0 then
    raise exception 'Cannot enforce organisation assignment: % invoice(s) are unassigned', v_missing;
  end if;
end $$;

alter table public.invoices
  alter column organization_id set not null;

create index if not exists invoices_organization_issue_date_idx
  on public.invoices (organization_id, issue_date desc);

create or replace view public.organisation_migration_status
with (security_invoker = true)
as
select
  count(*)::integer as invoice_count,
  count(*) filter (where i.organization_id is null)::integer as unassigned_invoice_count,
  count(*) filter (where i.organization_id is not null)::integer as assigned_invoice_count,
  count(distinct i.organization_id)::integer as organisation_count,
  count(*) filter (where i.organization_id is not null and o.id is null)::integer as orphaned_organisation_count
from public.invoices i
left join public.organizations o on o.id = i.organization_id;

grant select on public.organisation_migration_status to authenticated;

alter table public.organizations
  add column if not exists accent_hex text not null default '#171716';

alter table public.organizations
  drop constraint if exists organizations_accent_hex_check;

alter table public.organizations
  add constraint organizations_accent_hex_check
  check (accent_hex ~ '^#[0-9A-Fa-f]{6}$');

drop policy if exists "workspace members manage organizations" on public.organizations;

drop index if exists public.invoices_organization_invoice_number_uq;
drop index if exists public.projects_organization_idx;

revoke all on function public.next_invoice_number(uuid) from public;
revoke all on function public.next_invoice_number(uuid) from authenticated;

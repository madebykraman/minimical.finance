create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  created_by uuid not null references auth.users(id),
  source_name text not null,
  source_type text not null default 'spreadsheet',
  status text not null default 'review' check (status in ('review','importing','completed','completed_with_errors','cancelled')),
  total_rows integer not null default 0,
  ready_rows integer not null default 0,
  imported_rows integer not null default 0,
  skipped_rows integer not null default 0,
  blocked_rows integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.import_batch_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number integer not null,
  source_data jsonb not null default '{}'::jsonb,
  normalized_data jsonb not null default '{}'::jsonb,
  status text not null default 'ready' check (status in ('ready','duplicate','blocked','resolved','imported','skipped','failed')),
  issue_codes text[] not null default '{}'::text[],
  resolution jsonb not null default '{}'::jsonb,
  invoice_id uuid null references public.invoices(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(batch_id,row_number)
);

create index if not exists import_batches_org_created_idx on public.import_batches(organization_id,created_at desc);
create index if not exists import_batch_rows_batch_status_idx on public.import_batch_rows(batch_id,status);
create index if not exists import_batch_rows_invoice_idx on public.import_batch_rows(invoice_id);

alter table public.import_batches enable row level security;
alter table public.import_batch_rows enable row level security;

revoke all on table public.import_batches, public.import_batch_rows from anon, authenticated;
grant select, insert, update, delete on table public.import_batches, public.import_batch_rows to authenticated;

drop policy if exists "workspace members manage import batches" on public.import_batches;
create policy "workspace members manage import batches"
on public.import_batches
for all
to authenticated
using ((select private.is_workspace_member()))
with check ((select private.is_workspace_member()));

drop policy if exists "workspace members manage import batch rows" on public.import_batch_rows;
create policy "workspace members manage import batch rows"
on public.import_batch_rows
for all
to authenticated
using ((select private.is_workspace_member()))
with check ((select private.is_workspace_member()));

create or replace function public.migrate_invoice_organizations(
  p_invoice_ids uuid[],
  p_target_organization_id uuid,
  p_move_related boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_org public.organizations%rowtype;
  inv public.invoices%rowtype;
  client_org uuid;
  project_org uuid;
  source_org uuid;
  conflict_count integer;
  moved integer := 0;
  skipped integer := 0;
  issues jsonb := '[]'::jsonb;
begin
  if not (select private.is_workspace_member()) then
    raise exception 'Workspace membership required';
  end if;

  if p_invoice_ids is null or cardinality(p_invoice_ids) = 0 then
    raise exception 'No invoices selected';
  end if;

  select * into target_org
  from public.organizations
  where id = p_target_organization_id
    and status not in ('dissolved','discontinued');

  if target_org.id is null then
    raise exception 'Target organisation is invalid or inactive';
  end if;

  perform 1 from public.invoices where id = any(p_invoice_ids) for update;

  for inv in
    select * from public.invoices where id = any(p_invoice_ids) order by issue_date, invoice_number
  loop
    if inv.organization_id = p_target_organization_id then
      skipped := skipped + 1;
      continue;
    end if;

    source_org := inv.organization_id;

    if exists (
      select 1 from public.invoices
      where organization_id = p_target_organization_id
        and invoice_number = inv.invoice_number
        and id <> inv.id
    ) then
      issues := issues || jsonb_build_array(jsonb_build_object(
        'invoice_id', inv.id, 'invoice_number', inv.invoice_number, 'code', 'duplicate_invoice_number'
      ));
      continue;
    end if;

    if inv.client_id is not null then
      select organization_id into client_org from public.clients where id = inv.client_id;
      if client_org is distinct from p_target_organization_id then
        if not p_move_related then
          issues := issues || jsonb_build_array(jsonb_build_object(
            'invoice_id', inv.id, 'invoice_number', inv.invoice_number, 'code', 'client_belongs_to_other_organisation'
          ));
          continue;
        end if;
        select count(*) into conflict_count
        from public.invoices i
        where i.client_id = inv.client_id and i.id <> inv.id and not (i.id = any(p_invoice_ids));
        if conflict_count > 0 then
          issues := issues || jsonb_build_array(jsonb_build_object(
            'invoice_id', inv.id, 'invoice_number', inv.invoice_number, 'code', 'client_has_other_invoices'
          ));
          continue;
        end if;
      end if;
    end if;

    if inv.project_id is not null then
      select organization_id into project_org from public.projects where id = inv.project_id;
      if project_org is distinct from p_target_organization_id then
        if not p_move_related then
          issues := issues || jsonb_build_array(jsonb_build_object(
            'invoice_id', inv.id, 'invoice_number', inv.invoice_number, 'code', 'project_belongs_to_other_organisation'
          ));
          continue;
        end if;
        select count(*) into conflict_count
        from public.invoices i
        where i.project_id = inv.project_id and i.id <> inv.id and not (i.id = any(p_invoice_ids));
        if conflict_count > 0 then
          issues := issues || jsonb_build_array(jsonb_build_object(
            'invoice_id', inv.id, 'invoice_number', inv.invoice_number, 'code', 'project_has_other_invoices'
          ));
          continue;
        end if;
      end if;
    end if;

    if p_move_related then
      if inv.client_id is not null then
        update public.clients set organization_id = p_target_organization_id, updated_at = now()
        where id = inv.client_id and organization_id is distinct from p_target_organization_id;
      end if;
      if inv.project_id is not null then
        update public.projects set organization_id = p_target_organization_id, updated_at = now()
        where id = inv.project_id and organization_id is distinct from p_target_organization_id;
      end if;
    end if;

    update public.invoices set organization_id = p_target_organization_id, updated_at = now() where id = inv.id;
    update public.payments set organization_id = p_target_organization_id where invoice_id = inv.id;
    update public.documents set organization_id = p_target_organization_id where invoice_id = inv.id;

    insert into public.activity_log(invoice_id,action,metadata)
    values (inv.id,'invoice_organization_migrated',jsonb_build_object(
      'from_organization_id',source_org,'to_organization_id',p_target_organization_id,'moved_related',p_move_related
    ));
    moved := moved + 1;
  end loop;

  if jsonb_array_length(issues) > 0 then
    raise exception using message='Invoice organisation migration has unresolved conflicts', detail=issues::text;
  end if;

  return jsonb_build_object('moved',moved,'skipped',skipped,'target_organization_id',p_target_organization_id,'moved_related',p_move_related);
end;
$$;

revoke execute on function public.migrate_invoice_organizations(uuid[],uuid,boolean) from public, anon;
grant execute on function public.migrate_invoice_organizations(uuid[],uuid,boolean) to authenticated;

-- minimical.finance: single-user workspace access hardening
-- The current production owner is seeded here intentionally; this is an internal,
-- single-user application, not a multi-tenant workspace.

create table if not exists public.workspace_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.workspace_members enable row level security;

insert into public.workspace_members (user_id)
values ('f792e49f-1a66-40b3-920b-8b0d7b8b4a56')
on conflict (user_id) do nothing;

drop policy if exists "workspace member self access" on public.workspace_members;
create policy "workspace member self access"
on public.workspace_members
for select
to authenticated
using ((select auth.uid()) = user_id);

do $$
declare
  t text;
begin
  foreach t in array array['clients','projects','invoices','invoice_contents','payments','documents','activity_log']
  loop
    execute format('drop policy if exists "authenticated full access" on public.%I', t);
    execute format('drop policy if exists "workspace member access" on public.%I', t);
    execute format(
      'create policy "workspace member access" on public.%I for all to authenticated
       using (exists (select 1 from public.workspace_members wm where wm.user_id = (select auth.uid())))
       with check (exists (select 1 from public.workspace_members wm where wm.user_id = (select auth.uid())))',
      t
    );
  end loop;
end $$;

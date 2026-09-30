-- minimical.finance: single-user workspace access hardening
-- Uses a private SECURITY DEFINER membership helper so RLS never queries
-- workspace_members through its own restrictive policy.

create schema if not exists private;

create table if not exists public.workspace_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.workspace_members enable row level security;

insert into public.workspace_members (user_id)
select id from auth.users
where id = 'f792e49f-1a66-40b3-920b-8b0d7b8b4a56'
on conflict (user_id) do nothing;

create or replace function private.is_workspace_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_workspace_member() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_workspace_member() to authenticated;

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
       using ((select private.is_workspace_member()))
       with check ((select private.is_workspace_member()))',
      t
    );
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end $$;

revoke all on table public.workspace_members from anon;
grant select on table public.workspace_members to authenticated;

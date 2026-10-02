begin;

alter table public.invoice_versions enable row level security;
alter table public.document_versions enable row level security;

drop policy if exists "workspace member access" on public.invoice_versions;
create policy "workspace member access"
  on public.invoice_versions
  for all
  using ((select private.is_workspace_member()))
  with check ((select private.is_workspace_member()));

drop policy if exists "workspace member access" on public.document_versions;
create policy "workspace member access"
  on public.document_versions
  for all
  using ((select private.is_workspace_member()))
  with check ((select private.is_workspace_member()));

commit;
begin;

insert into storage.buckets (id,name,public)
values ('finos-documents','finos-documents',false)
on conflict (id) do update set public=false;

drop policy if exists "workspace members can read finance documents" on storage.objects;
create policy "workspace members can read finance documents"
on storage.objects for select
to authenticated
using (bucket_id='finos-documents' and (select private.is_workspace_member()));

drop policy if exists "workspace members can upload finance documents" on storage.objects;
create policy "workspace members can upload finance documents"
on storage.objects for insert
to authenticated
with check (bucket_id='finos-documents' and (select private.is_workspace_member()));

drop policy if exists "workspace members can update finance documents" on storage.objects;
create policy "workspace members can update finance documents"
on storage.objects for update
to authenticated
using (bucket_id='finos-documents' and (select private.is_workspace_member()))
with check (bucket_id='finos-documents' and (select private.is_workspace_member()));

drop policy if exists "workspace members can delete finance documents" on storage.objects;
create policy "workspace members can delete finance documents"
on storage.objects for delete
to authenticated
using (bucket_id='finos-documents' and (select private.is_workspace_member()));

commit;
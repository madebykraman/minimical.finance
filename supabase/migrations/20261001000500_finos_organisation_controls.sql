-- FinOS organisation controls, project/document audit and storage hardening
alter table public.organizations
  add column if not exists invoice_prefix text not null default '',
  add column if not exists next_invoice_number integer not null default 1,
  add column if not exists invoice_template_key text not null default 'legacy_elle';

update public.organizations o set next_invoice_number=greatest(1,coalesce((select max(nullif(regexp_replace(i.invoice_number,'[^0-9]','','g'),'')::integer)+1 from public.invoices i where i.organization_id=o.id),1));

create unique index if not exists invoices_org_number_unique on public.invoices(organization_id,invoice_number) where organization_id is not null;

create or replace function public.next_invoice_number(p_organization_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare v_prefix text; v_next integer; v_result text;
begin
 select invoice_prefix,next_invoice_number into v_prefix,v_next from public.organizations where id=p_organization_id for update;
 if not found then raise exception 'Organisation not found'; end if;
 v_result:=coalesce(v_prefix,'')||v_next::text;
 update public.organizations set next_invoice_number=v_next+1,updated_at=now() where id=p_organization_id;
 return v_result;
end $$;
revoke all on function public.next_invoice_number(uuid) from public;
grant execute on function public.next_invoice_number(uuid) to authenticated;

create table if not exists public.document_access_log(
 id uuid primary key default gen_random_uuid(), document_id uuid not null references public.documents(id) on delete cascade,
 client_id uuid references public.clients(id) on delete cascade, accessed_at timestamptz not null default now(), action text not null default 'download'
);
alter table public.document_access_log enable row level security;
drop policy if exists workspace_member_document_access_log on public.document_access_log;
create policy workspace_member_document_access_log on public.document_access_log for all to authenticated using ((select private.is_workspace_member())) with check ((select private.is_workspace_member()));
grant select,insert on public.document_access_log to authenticated;

create table if not exists public.project_activity(
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 action text not null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table public.project_activity enable row level security;
drop policy if exists workspace_member_project_activity on public.project_activity;
create policy workspace_member_project_activity on public.project_activity for all to authenticated using ((select private.is_workspace_member())) with check ((select private.is_workspace_member()));
grant select,insert,update,delete on public.project_activity to authenticated;

drop policy if exists workspace_member_organizations on public.organizations;
create policy workspace_member_organizations on public.organizations for all to authenticated using ((select private.is_workspace_member())) with check ((select private.is_workspace_member()));
grant select,insert,update,delete on public.organizations to authenticated;

insert into storage.buckets(id,name,public) values('finos-documents','finos-documents',false) on conflict(id) do nothing;
drop policy if exists finos_documents_workspace_select on storage.objects;
create policy finos_documents_workspace_select on storage.objects for select to authenticated using(bucket_id='finos-documents' and (select private.is_workspace_member()));
drop policy if exists finos_documents_workspace_insert on storage.objects;
create policy finos_documents_workspace_insert on storage.objects for insert to authenticated with check(bucket_id='finos-documents' and (select private.is_workspace_member()));
drop policy if exists finos_documents_workspace_update on storage.objects;
create policy finos_documents_workspace_update on storage.objects for update to authenticated using(bucket_id='finos-documents' and (select private.is_workspace_member())) with check(bucket_id='finos-documents' and (select private.is_workspace_member()));
drop policy if exists finos_documents_workspace_delete on storage.objects;
create policy finos_documents_workspace_delete on storage.objects for delete to authenticated using(bucket_id='finos-documents' and (select private.is_workspace_member()));
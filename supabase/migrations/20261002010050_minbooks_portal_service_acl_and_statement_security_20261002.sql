-- Portal RPCs are intentionally called only by server-side API routes.
revoke execute on function public.create_client_portal_session(text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.create_client_portal_session(text,text,text,timestamptz) to service_role;
revoke execute on function public.get_client_portal(text,text,text) from public, anon, authenticated;
grant execute on function public.get_client_portal(text,text,text) to service_role;
revoke execute on function public.get_client_portal_organization(text,text) from public, anon, authenticated;
grant execute on function public.get_client_portal_organization(text,text) to service_role;
revoke execute on function public.get_client_portal_secret(text,text) from public, anon, authenticated;
grant execute on function public.get_client_portal_secret(text,text) to service_role;
revoke execute on function public.log_client_portal_activity(text,text,text,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.log_client_portal_activity(text,text,text,text,uuid,jsonb) to service_role;
revoke execute on function public.update_client_portal_profile(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.update_client_portal_profile(text,text,jsonb) to service_role;

create or replace function public.get_client_portal_organization(p_slug text, p_session text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name',o.name,'legal_name',o.legal_name,'email',o.email,'phone',o.phone,
    'address_lines',o.address_lines,'pan',o.pan,'gstin',o.gstin,'logo_path',o.logo_path,
    'bank_name',o.bank_name,'account_number',o.account_number,'branch_name',o.branch_name,
    'branch_code',o.branch_code,'ifsc_code',o.ifsc_code,'payee_name',o.payee_name,
    'invoice_footer_line_1',o.invoice_footer_line_1,'invoice_footer_line_2',o.invoice_footer_line_2
  )
  from public.client_portal_sessions s
  join public.clients c on c.id=s.client_id
  left join public.organizations o on o.id=coalesce(
    c.organization_id,
    (select i.organization_id from public.invoices i where i.client_id=c.id and i.organization_id is not null order by i.issue_date desc limit 1)
  )
  where c.portal_slug=p_slug and c.portal_enabled=true and s.session_hash=p_session and s.expires_at>now()
  limit 1
$$;

grant execute on function public.get_client_portal_organization(text,text) to service_role;

drop policy if exists "workspace member access" on public.invoice_versions;
create policy "workspace member access" on public.invoice_versions
  for all to authenticated
  using ((select private.is_workspace_member()))
  with check ((select private.is_workspace_member()));

drop policy if exists "workspace member access" on public.document_versions;
create policy "workspace member access" on public.document_versions
  for all to authenticated
  using ((select private.is_workspace_member()))
  with check ((select private.is_workspace_member()));

revoke all on table public.invoice_versions, public.document_versions from anon;
grant select, insert, update, delete on table public.invoice_versions, public.document_versions to authenticated;
grant all on table public.invoice_versions, public.document_versions to service_role;

create unique index if not exists documents_client_statement_uidx
  on public.documents(client_id, document_type)
  where client_id is not null and document_type='statement_pdf';

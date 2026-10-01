-- Cover the remaining portal/audit foreign keys identified by Supabase performance advisor.
create index if not exists client_portal_activity_client_id_idx
  on public.client_portal_activity(client_id);

create index if not exists client_portal_tokens_contact_id_idx
  on public.client_portal_tokens(contact_id);

create index if not exists document_access_log_client_id_idx
  on public.document_access_log(client_id);

create index if not exists document_access_log_document_id_idx
  on public.document_access_log(document_id);

create index if not exists project_activity_project_id_idx
  on public.project_activity(project_id);
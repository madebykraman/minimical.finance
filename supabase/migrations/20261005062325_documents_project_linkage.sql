alter table public.documents
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists idx_documents_project_id
  on public.documents(project_id)
  where project_id is not null;

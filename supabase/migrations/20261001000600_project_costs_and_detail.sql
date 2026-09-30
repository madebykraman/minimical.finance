alter table public.projects
 add column if not exists description text,
 add column if not exists budget_cost numeric not null default 0,
 add column if not exists actual_cost numeric not null default 0,
 add column if not exists start_date date,
 add column if not exists end_date date;
create index if not exists projects_organization_idx on public.projects(organization_id);

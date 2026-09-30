-- Client workspace / portal preferences
alter table public.clients
  add column if not exists portal_enabled boolean not null default false,
  add column if not exists portal_slug text,
  add column if not exists portal_message text,
  add column if not exists allow_profile_edit boolean not null default false,
  add column if not exists show_projects boolean not null default true,
  add column if not exists show_documents boolean not null default true,
  add column if not exists archived_at timestamptz;

create unique index if not exists clients_portal_slug_idx on public.clients(portal_slug) where portal_slug is not null;

update public.clients
set portal_slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(id::text,1,6)
where portal_slug is null;

grant select, insert, update, delete on public.clients to authenticated;
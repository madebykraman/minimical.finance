-- Keep client documents private; portal access is mediated by FinOS.
alter table public.documents add column if not exists storage_bucket text not null default 'finos-documents';
update public.documents set storage_bucket='finos-documents' where storage_bucket is null or storage_bucket='';
insert into storage.buckets(id,name,public) values('finos-documents','finos-documents',false) on conflict(id) do nothing;

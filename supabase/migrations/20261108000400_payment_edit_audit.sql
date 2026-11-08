-- Audit update/delete operations on individually recorded payments.
-- Financial overpayment validation remains in tracker_validate_payment.
create table if not exists public.tracker_payment_revisions(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.tracker_organizations(id) on delete cascade,
 payment_id uuid not null,
 actor_id uuid default auth.uid(),
 action text not null check(action in ('update','delete')),
 before_record jsonb not null,
 after_record jsonb,
 created_at timestamptz not null default now()
);
alter table public.tracker_payment_revisions enable row level security;
revoke all on public.tracker_payment_revisions from public,anon;
grant select,insert on public.tracker_payment_revisions to authenticated;
drop policy if exists "workspace payment history" on public.tracker_payment_revisions;
create policy "workspace payment history" on public.tracker_payment_revisions for select to authenticated
using ((select private.is_workspace_member()));
drop policy if exists "workspace payment revisions insert" on public.tracker_payment_revisions;
create policy "workspace payment revisions insert" on public.tracker_payment_revisions for insert to authenticated
with check ((select private.is_workspace_member()) and actor_id=(select auth.uid()));
create index if not exists tracker_payment_revision_lookup
 on public.tracker_payment_revisions(organization_id,payment_id,created_at desc);

CREATE OR REPLACE FUNCTION public.tracker_record_payment_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if TG_OP='DELETE' then
  insert into public.tracker_payment_revisions(organization_id,payment_id,action,before_record,after_record)
  values(old.organization_id,old.id,'delete',to_jsonb(old),null);
  return old;
 end if;
 if to_jsonb(new) is distinct from to_jsonb(old) then
  insert into public.tracker_payment_revisions(organization_id,payment_id,action,before_record,after_record)
  values(old.organization_id,old.id,'update',to_jsonb(old),to_jsonb(new));
 end if;
 return new;
end $function$;
drop trigger if exists tracker_payments_revision_history on public.tracker_payments;
create trigger tracker_payments_revision_history
after update or delete on public.tracker_payments for each row execute function public.tracker_record_payment_revision();
revoke all on function public.tracker_record_payment_revision() from public,anon;

-- FinOS database audit triggers
create or replace function private.audit_invoice_row() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.activity_log(invoice_id,action,metadata) values(coalesce(new.id,old.id),case when tg_op='INSERT' then 'invoice_created' when tg_op='UPDATE' then 'invoice_updated' else 'invoice_deleted' end,jsonb_build_object('source','database_trigger','operation',tg_op)); return coalesce(new,old); end $$;
drop trigger if exists audit_invoices_row on public.invoices;
create trigger audit_invoices_row after insert or update or delete on public.invoices for each row execute function private.audit_invoice_row();

create or replace function private.audit_payment_row() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.activity_log(invoice_id,action,metadata) values(coalesce(new.invoice_id,old.invoice_id),case when tg_op='INSERT' then 'payment_recorded' when tg_op='UPDATE' then 'payment_updated' else 'payment_deleted' end,jsonb_build_object('source','database_trigger','operation',tg_op,'payment_id',coalesce(new.id,old.id))); return coalesce(new,old); end $$;
drop trigger if exists audit_payments_row on public.payments;
create trigger audit_payments_row after insert or update or delete on public.payments for each row execute function private.audit_payment_row();

create or replace function private.audit_project_row() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.project_activity(project_id,action,metadata) values(coalesce(new.id,old.id),case when tg_op='INSERT' then 'project_created' when tg_op='UPDATE' then 'project_updated' else 'project_deleted' end,jsonb_build_object('source','database_trigger','operation',tg_op)); return coalesce(new,old); end $$;
drop trigger if exists audit_projects_row on public.projects;
create trigger audit_projects_row after insert or update or delete on public.projects for each row execute function private.audit_project_row();
-- minimical.finance: financial invariants and read model

create or replace function private.sync_invoice_financial_state(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_total numeric := 0; v_paid numeric := 0; v_status public.invoice_status;
begin
  select coalesce(sum(case when priced then coalesce(amount, quantity * coalesce(rate, 0)) else 0 end),0) into v_total from public.invoice_contents where invoice_id=p_invoice_id;
  select coalesce(sum(amount),0) into v_paid from public.payments where invoice_id=p_invoice_id;
  select status into v_status from public.invoices where id=p_invoice_id for update;
  if v_status is null or v_status in ('draft','void') then return; end if;
  update public.invoices set status=case when v_total>0 and v_paid>=v_total then 'paid'::public.invoice_status when v_paid>0 then 'partially_paid'::public.invoice_status else 'sent'::public.invoice_status end, updated_at=now() where id=p_invoice_id;
end; $$;

revoke all on function private.sync_invoice_financial_state(uuid) from public;

create or replace function private.validate_payment_amount()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_total numeric := 0; v_other_paid numeric := 0;
begin
  if new.amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  select coalesce(sum(case when priced then coalesce(amount, quantity * coalesce(rate, 0)) else 0 end),0) into v_total from public.invoice_contents where invoice_id=new.invoice_id;
  select coalesce(sum(amount),0) into v_other_paid from public.payments where invoice_id=new.invoice_id and id<>new.id;
  if v_total<=0 then raise exception 'Cannot record a payment against an invoice with no priced contents'; end if;
  if v_other_paid+new.amount>v_total then raise exception 'Payment exceeds the current invoice balance'; end if;
  return new;
end; $$;

drop trigger if exists payments_validate_amount on public.payments;
create trigger payments_validate_amount before insert or update of amount, invoice_id on public.payments for each row execute function private.validate_payment_amount();

create or replace function private.reconcile_invoice_after_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.sync_invoice_financial_state(coalesce(new.invoice_id,old.invoice_id));
  if tg_op='UPDATE' and old.invoice_id is distinct from new.invoice_id then perform private.sync_invoice_financial_state(old.invoice_id); end if;
  return coalesce(new,old);
end; $$;

drop trigger if exists payments_reconcile_invoice on public.payments;
create trigger payments_reconcile_invoice after insert or update or delete on public.payments for each row execute function private.reconcile_invoice_after_payment();

create or replace function private.reconcile_invoice_after_content()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.sync_invoice_financial_state(coalesce(new.invoice_id,old.invoice_id));
  if tg_op='UPDATE' and old.invoice_id is distinct from new.invoice_id then perform private.sync_invoice_financial_state(old.invoice_id); end if;
  return coalesce(new,old);
end; $$;

drop trigger if exists invoice_contents_reconcile_invoice on public.invoice_contents;
create trigger invoice_contents_reconcile_invoice after insert or update or delete on public.invoice_contents for each row execute function private.reconcile_invoice_after_content();

create or replace view public.invoice_financials with (security_invoker=true) as
select i.id invoice_id,i.invoice_number,i.status,i.issue_date,i.due_date,i.client_id,i.project_id,i.source_total,
coalesce(c.total,0)::numeric total,coalesce(p.paid,0)::numeric paid,
greatest(coalesce(c.total,0)-coalesce(p.paid,0),0)::numeric balance,
case when i.due_date is not null and greatest(coalesce(c.total,0)-coalesce(p.paid,0),0)>0 and i.status<>'void' and i.due_date<current_date then true else false end is_overdue,
case when i.due_date is not null and greatest(coalesce(c.total,0)-coalesce(p.paid,0),0)>0 and i.status<>'void' and i.due_date<current_date then current_date-i.due_date else 0 end days_overdue
from public.invoices i
left join lateral (select coalesce(sum(case when ic.priced then coalesce(ic.amount,ic.quantity*coalesce(ic.rate,0)) else 0 end),0) total from public.invoice_contents ic where ic.invoice_id=i.id) c on true
left join lateral (select coalesce(sum(pay.amount),0) paid from public.payments pay where pay.invoice_id=i.id) p on true;

grant select on public.invoice_financials to authenticated;

do $$ declare r record; begin for r in select id from public.invoices loop perform private.sync_invoice_financial_state(r.id); end loop; end $$;

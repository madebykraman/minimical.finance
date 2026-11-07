-- Keep invoice creation and payment registration consistent under concurrent requests.
-- The PDF's original amounts are never rewritten by this migration.
create or replace function public.tracker_create_invoice(
 p_number text,p_date date,p_total numeric,p_row_ids uuid[]
) returns text language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_rows integer;
declare v_first uuid;
begin
 if not (select private.is_workspace_member()) then raise exception 'Access denied'; end if;
 p_number:=trim(coalesce(p_number,''));
 if p_number !~ '^[a-zA-Z0-9-]{1,36}$' or p_total is null or p_total < 0
    or p_date is null or coalesce(cardinality(p_row_ids),0)=0 then
   raise exception 'Invalid invoice details';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('tracker:invoice:'||lower(p_number),0));
 if exists(select 1 from public.tracker_rows where lower(invoice_number)=lower(p_number)) then
   raise exception 'Invoice number is already in use';
 end if;
 -- Lock all selected work before checking eligibility and assigning a group.
 perform id from public.tracker_rows where id=any(p_row_ids) order by id for update;
 select count(distinct id) into v_rows from public.tracker_rows
   where id=any(p_row_ids) and invoice_number is null;
 if v_rows<>cardinality(p_row_ids) then raise exception 'Selected work is no longer available'; end if;
 v_first:=p_row_ids[1];
 update public.tracker_rows set invoice_number=p_number,
   invoice_printed_total=case when id=v_first then p_total else null end,
   invoice_date=case when id=v_first then p_date else null end,
   invoice_state=case when id=v_first then 'Draft' else null end,
   payment_state=case when id=v_first then 'Unpaid' else null end,
   updated_at=now()
   where id=any(p_row_ids) and invoice_number is null;
 return p_number;
end $$;
revoke all on function public.tracker_create_invoice(text,date,numeric,uuid[]) from public,anon;
grant execute on function public.tracker_create_invoice(text,date,numeric,uuid[]) to authenticated;

create or replace function public.tracker_validate_payment() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_total numeric;
declare v_paid numeric;
begin
 if new.invoice_number is null or new.amount is null or new.amount<=0 then
   raise exception 'Invalid payment';
 end if;
 -- Serialize changes for one invoice so concurrent payments cannot overpay.
 perform pg_advisory_xact_lock(hashtextextended('tracker:payment:'||new.invoice_number,0));
 select max(invoice_printed_total) into v_total from public.tracker_rows
    where invoice_number=new.invoice_number;
 if v_total is null then raise exception 'Invoice group is missing a total'; end if;
 select coalesce(sum(amount),0) into v_paid from public.tracker_payments
    where invoice_number=new.invoice_number and id is distinct from new.id;
 if v_paid+new.amount>v_total then raise exception 'Payment would exceed invoice balance'; end if;
 return new;
end $$;
drop trigger if exists tracker_payments_validate on public.tracker_payments;
create trigger tracker_payments_validate before insert or update on public.tracker_payments
 for each row execute function public.tracker_validate_payment();

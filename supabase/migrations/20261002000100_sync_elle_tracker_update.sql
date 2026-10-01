-- Sync the Elle invoice tracker update supplied on 2026-10-02.
-- The tracker marks invoices 106 and 160 as fully paid.
-- The source does not specify payment method, so these completion payments use
-- "other" rather than inventing a bank/UPI/card method.

insert into public.payments (
  invoice_id,
  amount,
  payment_date,
  method,
  notes
)
select i.id, 13500, date '2026-01-25', 'other'::public.payment_method,
       'Updated from Elle Invoices & Tracker screenshot; payment method not specified.'
from public.invoices i
where i.invoice_number = '106'
  and not exists (
    select 1
    from public.payments p
    where p.invoice_id = i.id
      and p.amount = 13500
      and p.payment_date = date '2026-01-25'
  );

insert into public.payments (
  invoice_id,
  amount,
  payment_date,
  method,
  notes
)
select i.id, 19500, date '2026-07-07', 'other'::public.payment_method,
       'Updated from Elle Invoices & Tracker screenshot; payment method not specified.'
from public.invoices i
where i.invoice_number = '160'
  and not exists (
    select 1
    from public.payments p
    where p.invoice_id = i.id
      and p.amount = 19500
      and p.payment_date = date '2026-07-07'
  );

update public.invoices i
set status = 'paid'::public.invoice_status,
    updated_at = now()
where i.invoice_number in ('106','160')
  and (
    select coalesce(sum(p.amount),0)
    from public.payments p
    where p.invoice_id = i.id
  ) >= (
    select coalesce(sum(c.amount),0)
    from public.invoice_contents c
    where c.invoice_id = i.id
  );

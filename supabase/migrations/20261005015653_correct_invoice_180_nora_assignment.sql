-- Reconcile invoice 180 assignment against the authoritative Elle tracker.
-- The Nora row is explicitly assigned to Sharon in the source CSV/PDF.
with target as (
  select ic.id as content_id, i.id as invoice_id
  from public.invoice_contents ic
  join public.invoices i on i.id = ic.invoice_id
  where i.invoice_number = '180'
    and ic.title = 'Nora'
    and ic.position = 8
)
update public.invoice_contents ic
set assigned_by = 'Sharon'
from target t
where ic.id = t.content_id
  and ic.assigned_by is distinct from 'Sharon';

insert into public.activity_log(invoice_id, action, metadata)
select i.id,
       'source_reconciliation',
       jsonb_build_object(
         'field', 'invoice_contents.assigned_by',
         'line_title', 'Nora',
         'source', 'Internal Elle Invoice Tracker / Main Sheet CSV',
         'corrected_to', 'Sharon'
       )
from public.invoices i
where i.invoice_number = '180'
  and exists (
    select 1
    from public.invoice_contents ic
    where ic.invoice_id = i.id
      and ic.title = 'Nora'
      and ic.position = 8
      and ic.assigned_by = 'Sharon'
  )
  and not exists (
    select 1
    from public.activity_log a
    where a.invoice_id = i.id
      and a.action = 'source_reconciliation'
      and a.metadata->>'line_title' = 'Nora'
      and a.metadata->>'corrected_to' = 'Sharon'
  );

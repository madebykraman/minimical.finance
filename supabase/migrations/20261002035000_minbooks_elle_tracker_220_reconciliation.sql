update public.invoice_contents
set title=$$Prime Video's Obsessed Retreat + Prime Video Lili Reinhart$$,
    amount=6000,
    rate=6000,
    quantity=1,
    priced=true,
    note='2 Videos'
where invoice_id=(select id from public.invoices where invoice_number='220' limit 1)
  and title=$$Prime Video's Obsessed Retreat$$;

delete from public.invoice_contents
where invoice_id=(select id from public.invoices where invoice_number='220' limit 1)
  and title='ELLE In Conversation With Lili Reinhart';

update public.invoice_contents
set position=2
where invoice_id=(select id from public.invoices where invoice_number='220' limit 1)
  and title='MAHEIKA × Elle';

update public.invoices
set source_total=12000,
    status='sent',
    updated_at=now()
where invoice_number='220';

update public.invoice_versions iv
set snapshot=public.invoice_snapshot(iv.invoice_id),
    snapshot_hash=encode(digest(public.invoice_snapshot(iv.invoice_id)::text,'sha256'),'hex')
where iv.invoice_id=(select id from public.invoices where invoice_number='220' limit 1)
  and iv.version_number=(select issued_version from public.invoices where invoice_number='220' limit 1);
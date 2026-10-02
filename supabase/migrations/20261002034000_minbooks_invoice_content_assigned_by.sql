alter table public.invoice_contents add column if not exists assigned_by text;

update public.invoice_contents ic set assigned_by='Ekta' from public.invoices i where ic.invoice_id=i.id and i.invoice_number in ('21','43','106','180');
update public.invoice_contents ic set assigned_by='Anamm' from public.invoices i where ic.invoice_id=i.id and i.invoice_number in ('160','166','195');
update public.invoice_contents ic set assigned_by='Sharon' from public.invoices i where ic.invoice_id=i.id and i.invoice_number='220' and ic.title='Elle ft. Shweta Tripathi & Mallika Dua';
update public.invoice_contents ic set assigned_by='Ekta' from public.invoices i where ic.invoice_id=i.id and i.invoice_number='220' and ic.title=$$Prime Video's Obsessed Retreat + Prime Video Lili Reinhart$$;
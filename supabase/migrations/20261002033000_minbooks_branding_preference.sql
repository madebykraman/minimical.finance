alter table public.organizations add column if not exists show_minbooks_branding boolean not null default true;
update public.organizations set show_minbooks_branding=false where id='fc9a2161-8174-41b3-aaf6-3d88c2f8ce52'::uuid;
alter table public.organizations alter column invoice_footer_line_2 set default 'Thank you for your time and the opportunity to work together.';
update public.organizations set invoice_footer_line_2='Thank you for your time and the opportunity to work together.' where id='fc9a2161-8174-41b3-aaf6-3d88c2f8ce52'::uuid;

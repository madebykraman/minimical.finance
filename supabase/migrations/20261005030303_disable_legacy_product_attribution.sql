-- The application is organisation-led and does not expose a product brand.
alter table public.organizations
  alter column show_minbooks_branding set default false;

update public.organizations
set show_minbooks_branding = false
where show_minbooks_branding is distinct from false;

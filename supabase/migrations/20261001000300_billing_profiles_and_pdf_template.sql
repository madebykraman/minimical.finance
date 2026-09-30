-- minimical.finance: stored billing identity and client invoice profiles

create table if not exists public.workspace_settings (
  id boolean primary key default true check (id = true),
  studio_name text not null default 'Kumar Aman',
  brand_name text not null default 'minimical',
  contact_email text,
  payee_name text,
  account_number text,
  bank_name text,
  branch_name text,
  branch_code text,
  ifsc_code text,
  pan_number text,
  invoice_footer_line_1 text,
  invoice_footer_line_2 text,
  pdf_template text not null default 'legacy_elle',
  updated_at timestamptz not null default now()
);

alter table public.workspace_settings enable row level security;

drop policy if exists workspace_settings_access on public.workspace_settings;
create policy workspace_settings_access on public.workspace_settings
for all to authenticated
using ((select private.is_workspace_member()))
with check ((select private.is_workspace_member()));

revoke all on public.workspace_settings from anon;
grant select, insert, update, delete on public.workspace_settings to authenticated;

alter table public.clients
  add column if not exists legal_name text,
  add column if not exists address_lines jsonb not null default '[]'::jsonb,
  add column if not exists pan text,
  add column if not exists gstin text;

grant select, insert, update, delete on public.clients to authenticated;

insert into public.workspace_settings (
  id, studio_name, brand_name, contact_email, payee_name, account_number, bank_name,
  branch_name, branch_code, ifsc_code, pan_number, invoice_footer_line_1, invoice_footer_line_2, pdf_template
) values (
  true, 'Kumar Aman', 'minimical', 'framedbyaman@gmail.com', 'Kumar Aman',
  '55550101570800', 'FEDERAL BANK', 'Patna/Kankarbagh', '2189', 'FDRL0002189',
  'CIBPA9801L',
  'Please contact framedbyaman@gmail.com in case of any queries.',
  'Thank you for your time.',
  'legacy_elle'
)
on conflict (id) do update set
  studio_name=excluded.studio_name,
  brand_name=excluded.brand_name,
  contact_email=excluded.contact_email,
  payee_name=excluded.payee_name,
  account_number=excluded.account_number,
  bank_name=excluded.bank_name,
  branch_name=excluded.branch_name,
  branch_code=excluded.branch_code,
  ifsc_code=excluded.ifsc_code,
  pan_number=excluded.pan_number,
  invoice_footer_line_1=excluded.invoice_footer_line_1,
  invoice_footer_line_2=excluded.invoice_footer_line_2,
  pdf_template=excluded.pdf_template,
  updated_at=now();

update public.clients
set
  legal_name='Ogaan Media Pvt. Ltd.',
  address_lines='["Floor 11, A-1102, Naman Midtown","Senapati Bapat Marg, Nr India Bulls","Prabhadevi, Mumbai City"]'::jsonb,
  pan='AAACO1078K',
  gstin='27AAACO1078K1ZB'
where lower(name)='elle india';

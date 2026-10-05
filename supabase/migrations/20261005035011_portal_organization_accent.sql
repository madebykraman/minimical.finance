create or replace function public.get_client_portal_organization(p_slug text, p_session text)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'name',o.name,'legal_name',o.legal_name,'email',o.email,'phone',o.phone,
    'address_lines',o.address_lines,'pan',o.pan,'gstin',o.gstin,'logo_path',o.logo_path,
    'accent_hex',o.accent_hex,
    'bank_name',o.bank_name,'account_number',o.account_number,'branch_name',o.branch_name,
    'branch_code',o.branch_code,'ifsc_code',o.ifsc_code,'payee_name',o.payee_name,
    'invoice_footer_line_1',o.invoice_footer_line_1,'invoice_footer_line_2',o.invoice_footer_line_2
  )
  from public.client_portal_sessions s
  join public.clients c on c.id=s.client_id
  left join public.organizations o on o.id=coalesce(
    c.organization_id,
    (select i.organization_id from public.invoices i where i.client_id=c.id and i.organization_id is not null order by i.issue_date desc limit 1)
  )
  where c.portal_slug=p_slug
    and c.portal_enabled=true
    and s.session_hash=p_session
    and s.expires_at>now()
  limit 1
$function$;

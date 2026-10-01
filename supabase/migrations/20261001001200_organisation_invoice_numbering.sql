-- Organisation-specific invoice numbering.
create unique index if not exists invoices_organization_invoice_number_uq
  on public.invoices (organization_id, invoice_number)
  where organization_id is not null;

create or replace function public.allocate_invoice_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_prefix text; v_number integer;
begin
  if not private.is_workspace_member() then raise exception 'Workspace access denied'; end if;
  update public.organizations
     set next_invoice_number=coalesce(next_invoice_number,1)+1, updated_at=now()
   where id=p_organization_id and status not in ('dissolved','discontinued')
   returning invoice_prefix,next_invoice_number-1 into v_prefix,v_number;
  if v_number is null then raise exception 'Organisation is unavailable for invoicing'; end if;
  return coalesce(v_prefix,'')||v_number::text;
end;
$$;

revoke all on function public.allocate_invoice_number(uuid) from public;
grant execute on function public.allocate_invoice_number(uuid) to authenticated;

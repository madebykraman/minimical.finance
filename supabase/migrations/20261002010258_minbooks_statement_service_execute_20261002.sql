revoke execute on function public.statement_ledger(uuid,date,date) from public, anon, authenticated;
grant execute on function public.statement_ledger(uuid,date,date) to authenticated, service_role;

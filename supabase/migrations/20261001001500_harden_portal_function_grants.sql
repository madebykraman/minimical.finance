-- Portal access is intentionally anonymous at the database RPC boundary.
-- Signed-in workspace users do not need direct execution rights for these
-- SECURITY DEFINER portal functions; server routes use the anonymous role
-- while the functions validate the portal token/session themselves.
revoke execute on function public.log_client_portal_activity(text,text,text,text,uuid,jsonb) from authenticated;
revoke execute on function public.update_client_portal_profile(text,text,jsonb) from authenticated;

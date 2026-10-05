create or replace function public.revoke_client_portal_access(p_client_id uuid)
returns boolean
language plpgsql
security invoker
set search_path to ''
as $function$
begin
  if not private.is_workspace_member() then
    raise exception 'Workspace access denied';
  end if;

  update public.clients
  set portal_enabled=false,
      updated_at=now()
  where id=p_client_id;

  if not found then
    raise exception 'Client not found';
  end if;

  delete from public.client_portal_sessions
  where client_id=p_client_id;

  update public.client_portal_tokens
  set revoked_at=coalesce(revoked_at,now())
  where client_id=p_client_id
    and revoked_at is null;

  insert into public.client_portal_activity(client_id,action,resource_type,resource_id,metadata)
  values(
    p_client_id,
    'access_revoked',
    'account',
    p_client_id,
    jsonb_build_object('sessions_revoked',true,'tokens_revoked',true)
  );

  return true;
end;
$function$;

revoke all on function public.revoke_client_portal_access(uuid) from public, anon;
grant execute on function public.revoke_client_portal_access(uuid) to authenticated;

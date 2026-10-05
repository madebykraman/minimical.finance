create or replace function public.rotate_client_portal_password(
  p_client_id uuid,
  p_password_hash text
)
returns boolean
language plpgsql
security invoker
set search_path to ''
as $function$
begin
  if not private.is_workspace_member() then
    raise exception 'Workspace access denied';
  end if;
  if p_password_hash is null or length(trim(p_password_hash)) < 20 then
    raise exception 'Invalid portal password hash';
  end if;

  update public.clients
  set portal_password_hash=p_password_hash,
      portal_password_set_at=now(),
      portal_enabled=true,
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
    'password_rotated',
    'account',
    p_client_id,
    jsonb_build_object('sessions_revoked',true,'tokens_revoked',true)
  );

  return true;
end;
$function$;

revoke all on function public.rotate_client_portal_password(uuid,text) from public, anon;
grant execute on function public.rotate_client_portal_password(uuid,text) to authenticated;

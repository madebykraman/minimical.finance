-- FinOS portal profile editing and audit trail
create table if not exists public.client_portal_activity(
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
 action text not null, resource_type text, resource_id uuid, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table public.client_portal_activity enable row level security;
drop policy if exists workspace_member_client_portal_activity on public.client_portal_activity;
create policy workspace_member_client_portal_activity on public.client_portal_activity for all to authenticated using ((select private.is_workspace_member())) with check ((select private.is_workspace_member()));
grant select,insert,update,delete on public.client_portal_activity to authenticated;

create or replace function public.log_client_portal_activity(p_slug text,p_session text,p_action text,p_resource_type text default null,p_resource_id uuid default null,p_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_client_id uuid;
begin
 select c.id into v_client_id from public.clients c join public.client_portal_sessions s on s.client_id=c.id where c.portal_slug=p_slug and c.portal_enabled=true and s.session_hash=p_session and s.expires_at>now() limit 1;
 if v_client_id is null then raise exception 'Portal session invalid'; end if;
 insert into public.client_portal_activity(client_id,action,resource_type,resource_id,metadata) values(v_client_id,p_action,p_resource_type,p_resource_id,coalesce(p_metadata,'{}'::jsonb));
end $$;
revoke all on function public.log_client_portal_activity(text,text,text,text,uuid,jsonb) from public;
grant execute on function public.log_client_portal_activity(text,text,text,text,uuid,jsonb) to anon,authenticated;

create or replace function public.update_client_portal_profile(p_slug text,p_session text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_client public.clients%rowtype;
begin
 select c.* into v_client from public.clients c join public.client_portal_sessions s on s.client_id=c.id where c.portal_slug=p_slug and c.portal_enabled=true and c.allow_profile_edit=true and s.session_hash=p_session and s.expires_at>now() limit 1;
 if v_client.id is null then raise exception 'Profile editing is disabled or portal session is invalid'; end if;
 update public.clients set name=coalesce(nullif(trim(p_payload->>'name'),''),name),legal_name=nullif(trim(coalesce(p_payload->>'legal_name','')), ''),email=nullif(trim(coalesce(p_payload->>'email','')), ''),phone=nullif(trim(coalesce(p_payload->>'phone','')), ''),address_lines=case when jsonb_typeof(p_payload->'address_lines')='array' then p_payload->'address_lines' else address_lines end,pan=nullif(trim(coalesce(p_payload->>'pan','')), ''),gstin=nullif(trim(coalesce(p_payload->>'gstin','')), ''),updated_at=now() where id=v_client.id returning * into v_client;
 insert into public.client_portal_activity(client_id,action,resource_type,metadata) values(v_client.id,'profile_updated','client','{}'::jsonb);
 return jsonb_build_object('id',v_client.id,'name',v_client.name,'legal_name',v_client.legal_name,'email',v_client.email,'phone',v_client.phone,'address_lines',v_client.address_lines,'pan',v_client.pan,'gstin',v_client.gstin,'logo_path',v_client.logo_path,'portal_message',v_client.portal_message,'show_projects',v_client.show_projects,'show_documents',v_client.show_documents,'allow_profile_edit',v_client.allow_profile_edit);
end $$;
revoke all on function public.update_client_portal_profile(text,text,jsonb) from public;
grant execute on function public.update_client_portal_profile(text,text,jsonb) to anon,authenticated;

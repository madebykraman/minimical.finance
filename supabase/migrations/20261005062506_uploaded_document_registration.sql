create or replace function public.register_uploaded_document(
  p_document_id uuid,
  p_organization_id uuid,
  p_client_id uuid,
  p_project_id uuid,
  p_file_path text,
  p_file_name text,
  p_description text,
  p_mime_type text,
  p_size_bytes bigint,
  p_checksum_sha256 text,
  p_visible_to_client boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_id uuid := coalesce(p_document_id, gen_random_uuid());
begin
  if not private.is_workspace_member() then raise exception 'Workspace access denied'; end if;
  if p_organization_id is null then raise exception 'Organisation is required'; end if;
  if coalesce(trim(p_file_path),'')='' or coalesce(trim(p_file_name),'')='' then raise exception 'Stored file path and file name are required'; end if;
  if coalesce(trim(p_checksum_sha256),'')='' then raise exception 'Document checksum is required'; end if;
  if not exists(select 1 from public.organizations o where o.id=p_organization_id) then raise exception 'Organisation not found'; end if;
  if p_client_id is not null and not exists(select 1 from public.clients c where c.id=p_client_id and c.organization_id=p_organization_id and c.archived_at is null) then
    raise exception 'Client does not belong to the selected organisation';
  end if;
  if p_project_id is not null then
    if p_client_id is null then raise exception 'A project-linked document must also have a client'; end if;
    if not exists(select 1 from public.projects p where p.id=p_project_id and p.organization_id=p_organization_id and p.client_id=p_client_id and p.archived_at is null) then
      raise exception 'Project does not belong to the selected client and organisation';
    end if;
  end if;
  if coalesce(p_visible_to_client,false) and p_client_id is null then raise exception 'Client visibility requires a linked client'; end if;

  insert into public.documents(
    id,organization_id,client_id,project_id,document_type,file_path,file_name,
    visible_to_client,description,mime_type,size_bytes,storage_bucket,
    version_number,status,source_hash,checksum_sha256,generated_at,issued_at
  ) values(
    v_id,p_organization_id,p_client_id,p_project_id,'uploaded_file',p_file_path,p_file_name,
    coalesce(p_visible_to_client,false),nullif(trim(p_description),''),nullif(trim(p_mime_type),''),
    p_size_bytes,'finos-documents',1,'stored',p_checksum_sha256,p_checksum_sha256,now(),now()
  );

  insert into public.document_versions(
    document_id,version_number,file_path,file_name,storage_bucket,mime_type,
    size_bytes,checksum_sha256,generated_at,generated_by,metadata
  ) values(
    v_id,1,p_file_path,p_file_name,'finos-documents',nullif(trim(p_mime_type),''),
    p_size_bytes,p_checksum_sha256,now(),auth.uid(),
    jsonb_build_object('source','upload','project_id',p_project_id,'client_id',p_client_id)
  );

  return v_id;
end;
$function$;

revoke all on function public.register_uploaded_document(uuid,uuid,uuid,uuid,text,text,text,text,bigint,text,boolean) from public, anon;
grant execute on function public.register_uploaded_document(uuid,uuid,uuid,uuid,text,text,text,text,bigint,text,boolean) to authenticated;

create or replace function public.register_uploaded_document_version(
  p_document_id uuid,
  p_file_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_checksum_sha256 text
)
returns integer
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_doc public.documents%rowtype;
  v_next integer;
begin
  if not private.is_workspace_member() then raise exception 'Workspace access denied'; end if;

  select * into v_doc from public.documents where id=p_document_id for update;
  if v_doc.id is null then raise exception 'Document not found'; end if;
  if v_doc.document_type<>'uploaded_file' then raise exception 'Only uploaded files accept replacement versions'; end if;
  if coalesce(trim(p_file_path),'')='' or coalesce(trim(p_file_name),'')='' then raise exception 'Stored file path and file name are required'; end if;
  if coalesce(trim(p_checksum_sha256),'')='' then raise exception 'Document checksum is required'; end if;

  v_next:=coalesce(v_doc.version_number,0)+1;

  update public.documents
  set file_path=p_file_path,file_name=p_file_name,mime_type=nullif(trim(p_mime_type),''),
      size_bytes=p_size_bytes,version_number=v_next,status='stored',
      source_hash=p_checksum_sha256,checksum_sha256=p_checksum_sha256,generated_at=now()
  where id=p_document_id;

  insert into public.document_versions(
    document_id,version_number,file_path,file_name,storage_bucket,mime_type,
    size_bytes,checksum_sha256,generated_at,generated_by,metadata
  ) values(
    p_document_id,v_next,p_file_path,p_file_name,'finos-documents',
    nullif(trim(p_mime_type),''),p_size_bytes,p_checksum_sha256,now(),auth.uid(),
    jsonb_build_object('source','upload_version')
  );

  return v_next;
end;
$function$;

revoke all on function public.register_uploaded_document_version(uuid,text,text,text,bigint,text) from public, anon;
grant execute on function public.register_uploaded_document_version(uuid,text,text,text,bigint,text) to authenticated;

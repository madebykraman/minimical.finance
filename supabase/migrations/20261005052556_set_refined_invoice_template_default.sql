alter table public.organizations
  alter column invoice_template_key set default 'clean';

update public.organizations
set invoice_template_key='clean', updated_at=now()
where invoice_template_key='legacy_elle';

do $$
declare
  r record;
  v_snapshot jsonb;
  v_hash text;
  v_next integer;
begin
  for r in
    select i.id,i.organization_id,i.client_id,i.invoice_number,i.status,o.invoice_template_key,
           coalesce(iv.snapshot->'organization'->>'invoice_template_key','') as snapshot_template
    from public.invoices i
    join public.organizations o on o.id=i.organization_id
    left join public.invoice_versions iv on iv.invoice_id=i.id and iv.version_number=i.issued_version
    where i.status not in ('draft','void')
      and coalesce(iv.snapshot->'organization'->>'invoice_template_key','') is distinct from o.invoice_template_key
  loop
    v_snapshot:=public.invoice_snapshot(r.id);
    v_hash:=encode(extensions.digest(v_snapshot::text,'sha256'),'hex');
    select coalesce(max(version_number),0)+1 into v_next from public.invoice_versions where invoice_id=r.id;

    insert into public.invoice_versions(invoice_id,organization_id,version_number,snapshot,snapshot_hash,created_by)
    values(r.id,r.organization_id,v_next,v_snapshot,v_hash,null);

    update public.invoices
      set issued_version=v_next,updated_at=now()
      where id=r.id;

    insert into public.documents(
      invoice_id,client_id,organization_id,document_type,file_path,file_name,
      visible_to_client,description,mime_type,status,version_number,template_key,source_hash,issued_at
    )
    values(
      r.id,r.client_id,r.organization_id,'invoice_pdf','','INV_'||r.invoice_number||'.pdf',
      false,'Canonical refined invoice','application/pdf','pending',v_next,'clean',v_hash,now()
    )
    on conflict (invoice_id,document_type,version_number)
      where invoice_id is not null and document_type <> 'receipt_pdf'
      do nothing;

    insert into public.activity_log(invoice_id,action,metadata)
    values(r.id,'invoice_template_upgraded',jsonb_build_object(
      'version_number',v_next,
      'template_key','clean',
      'previous_template',r.snapshot_template
    ));
  end loop;
end $$;

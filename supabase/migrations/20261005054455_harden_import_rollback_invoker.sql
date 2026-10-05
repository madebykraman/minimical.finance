CREATE OR REPLACE FUNCTION public.rollback_import_batch(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  b public.import_batches%rowtype;
  invoice_ids uuid[];
  deleted_count integer := 0;
begin
  if not private.is_workspace_member() then raise exception 'Workspace access denied'; end if;

  select * into b from public.import_batches where id=p_batch_id for update;
  if b.id is null then raise exception 'Import batch not found'; end if;
  if b.status <> 'completed' then raise exception 'Only completed import batches can be rolled back'; end if;

  select coalesce(array_agg(distinct r.invoice_id) filter (where r.invoice_id is not null),'{}'::uuid[])
    into invoice_ids
  from public.import_batch_rows r
  where r.batch_id=p_batch_id;

  if coalesce(array_length(invoice_ids,1),0)=0 then raise exception 'This import has no linked invoices to roll back'; end if;

  if exists(select 1 from public.invoices i where i.id=any(invoice_ids) and i.status <> 'draft') then
    raise exception 'Rollback refused: an imported invoice is no longer a draft';
  end if;
  if exists(select 1 from public.payments p where p.invoice_id=any(invoice_ids)) then
    raise exception 'Rollback refused: an imported invoice has payments';
  end if;
  if exists(select 1 from public.documents d where d.invoice_id=any(invoice_ids)) then
    raise exception 'Rollback refused: an imported invoice has documents';
  end if;
  if exists(select 1 from public.invoice_versions v where v.invoice_id=any(invoice_ids)) then
    raise exception 'Rollback refused: an imported invoice has issued versions';
  end if;
  if exists(select 1 from public.activity_log a where a.invoice_id=any(invoice_ids) and b.completed_at is not null and a.created_at>b.completed_at) then
    raise exception 'Rollback refused: an imported invoice changed after the import completed';
  end if;

  delete from public.invoices where id=any(invoice_ids);
  get diagnostics deleted_count = row_count;

  update public.import_batch_rows
    set status='rolled_back',
        resolution=coalesce(resolution,'{}'::jsonb)||jsonb_build_object('rolled_back',true,'rolled_back_at',now())
  where batch_id=p_batch_id and status='imported';

  update public.import_batches
    set status='cancelled',
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('rolled_back_at',now(),'rolled_back_by',auth.uid())
  where id=p_batch_id;

  return jsonb_build_object('rolled_back',deleted_count,'safe',true);
end;
$function$
;

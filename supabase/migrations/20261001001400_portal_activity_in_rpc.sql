-- Extend the client portal payload with its audit trail without exposing internal activity.
create or replace function public.get_client_portal(p_slug text,p_token text default null,p_session text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_client public.clients%rowtype; v_ok boolean:=false; v_result jsonb;
begin
 select c.* into v_client from public.clients c where c.portal_slug=p_slug and c.portal_enabled=true and c.archived_at is null limit 1;
 if v_client.id is null then raise exception 'Portal not found'; end if;
 if p_session is not null then
   select exists(select 1 from public.client_portal_sessions s where s.client_id=v_client.id and s.session_hash=p_session and s.expires_at>now()) into v_ok;
 elsif p_token is not null then
   select exists(select 1 from public.client_portal_tokens t where t.client_id=v_client.id and t.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and t.revoked_at is null and (t.expires_at is null or t.expires_at>now())) into v_ok;
 end if;
 if not v_ok then raise exception 'Portal access is invalid or expired'; end if;
 if p_session is not null then update public.client_portal_sessions set last_used_at=now() where session_hash=p_session; end if;
 select jsonb_build_object(
  'client',jsonb_build_object('id',v_client.id,'name',v_client.name,'legal_name',v_client.legal_name,'email',v_client.email,'phone',v_client.phone,'address_lines',v_client.address_lines,'pan',v_client.pan,'gstin',v_client.gstin,'logo_path',v_client.logo_path,'portal_message',v_client.portal_message,'show_projects',v_client.show_projects,'show_documents',v_client.show_documents,'allow_profile_edit',v_client.allow_profile_edit),
  'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'invoice_number',i.invoice_number,'issue_date',i.issue_date,'due_date',i.due_date,'status',i.status,'total',f.total,'paid',f.paid,'balance',f.balance,'is_overdue',f.is_overdue,'project_id',i.project_id,'project_name',pr.name,'notes',i.notes,'adjustment_note',i.adjustment_note,'contents',coalesce((select jsonb_agg(jsonb_build_object('id',ic.id,'position',ic.position,'kind',ic.kind,'title',ic.title,'description',ic.description,'quantity',ic.quantity,'rate',ic.rate,'amount',ic.amount,'priced',ic.priced,'note',ic.note) order by ic.position) from public.invoice_contents ic where ic.invoice_id=i.id),'[]'::jsonb)) order by i.issue_date desc) from public.invoices i join public.invoice_financials f on f.invoice_id=i.id left join public.projects pr on pr.id=i.project_id where i.client_id=v_client.id and i.status not in ('draft','void')),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'invoice_id',p.invoice_id,'invoice_number',i.invoice_number,'amount',p.amount,'payment_date',p.payment_date,'method',p.method,'reference',p.reference,'notes',p.notes,'receipt_number',coalesce(p.receipt_number,'RCP-'||i.invoice_number||'-'||left(replace(p.id::text,'-',''),8))) order by coalesce(p.payment_date,p.created_at) desc) from public.payments p join public.invoices i on i.id=p.invoice_id where i.client_id=v_client.id),'[]'::jsonb),
  'projects',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'description',p.description,'status',p.status,'start_date',p.start_date,'end_date',p.end_date,'budget_cost',p.budget_cost,'actual_cost',p.actual_cost) order by p.name) from public.projects p where p.client_id=v_client.id),'[]'::jsonb),
  'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'invoice_id',d.invoice_id,'document_type',d.document_type,'file_name',d.file_name,'description',d.description,'mime_type',d.mime_type,'created_at',d.created_at,'file_path',d.file_path) order by d.created_at desc) from public.documents d where d.client_id=v_client.id and d.visible_to_client=true),'[]'::jsonb),
  'activity',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'resource_type',a.resource_type,'resource_id',a.resource_id,'metadata',a.metadata,'created_at',a.created_at) order by a.created_at desc) from public.client_portal_activity a where a.client_id=v_client.id),'[]'::jsonb)
 ) into v_result;
 return v_result;
end;
$$;

-- Allow invoice editing to atomically update its client and project relationships.
drop function if exists public.save_invoice(uuid,text,text,date,date,public.invoice_status,uuid,jsonb);

create or replace function public.save_invoice(
  p_invoice_id uuid,
  p_client_id uuid default null,
  p_project_id uuid default null,
  p_notes text default null,
  p_adjustment_note text default null,
  p_issue_date date default null,
  p_due_date date default null,
  p_status public.invoice_status default 'draft',
  p_organization_id uuid default null,
  p_contents jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_paid numeric := 0;
  v_total numeric := 0;
  v_item jsonb;
  v_position integer := 0;
  v_final_status public.invoice_status;
begin
  if p_organization_id is null then raise exception 'Select a billing organisation before saving the invoice'; end if;
  if not exists(select 1 from public.invoices i where i.id=p_invoice_id) then raise exception 'Invoice not found'; end if;
  if not exists(select 1 from public.organizations o where o.id=p_organization_id) then raise exception 'Billing organisation not found'; end if;
  if p_client_id is not null and not exists(select 1 from public.clients c where c.id=p_client_id and c.organization_id=p_organization_id) then raise exception 'Selected client does not belong to the billing organisation'; end if;
  if p_project_id is not null and not exists(select 1 from public.projects p where p.id=p_project_id and p.organization_id=p_organization_id and (p_client_id is null or p.client_id=p_client_id)) then raise exception 'Selected project does not belong to the billing organisation and client'; end if;

  select coalesce(sum(amount),0) into v_paid from public.payments where invoice_id=p_invoice_id;
  select coalesce(sum(case when coalesce((value->>'priced')::boolean,false) then coalesce((value->>'amount')::numeric,coalesce((value->>'quantity')::numeric,1)*coalesce((value->>'rate')::numeric,0)) else 0 end),0)
    into v_total from jsonb_array_elements(coalesce(p_contents,'[]'::jsonb));
  if v_paid>v_total then raise exception 'Invoice contents total cannot be lower than payments already recorded'; end if;

  update public.invoices
  set client_id=p_client_id, project_id=p_project_id, notes=p_notes, adjustment_note=p_adjustment_note,
      issue_date=p_issue_date, due_date=p_due_date, organization_id=p_organization_id, updated_at=now()
  where id=p_invoice_id;

  delete from public.invoice_contents where invoice_id=p_invoice_id;
  for v_item in select value from jsonb_array_elements(coalesce(p_contents,'[]'::jsonb)) loop
    insert into public.invoice_contents(invoice_id,position,kind,title,quantity,rate,amount,priced,note)
    values(p_invoice_id,v_position,(v_item->>'kind')::public.invoice_content_kind,coalesce(v_item->>'title',''),
      coalesce(nullif(v_item->>'quantity','')::numeric,1),nullif(v_item->>'rate','')::numeric,
      case when coalesce((v_item->>'priced')::boolean,false) then coalesce(nullif(v_item->>'amount','')::numeric,coalesce(nullif(v_item->>'quantity','')::numeric,1)*coalesce(nullif(v_item->>'rate','')::numeric,0)) else null end,
      coalesce((v_item->>'priced')::boolean,false),nullif(v_item->>'note',''));
    v_position:=v_position+1;
  end loop;

  if p_status in ('draft','void') then v_final_status:=p_status;
  elsif v_total>0 and v_paid>=v_total then v_final_status:='paid';
  elsif v_paid>0 then v_final_status:='partially_paid';
  else v_final_status:='sent'; end if;
  update public.invoices set status=v_final_status,updated_at=now() where id=p_invoice_id;
  insert into public.activity_log(invoice_id,action,metadata) values(p_invoice_id,'invoice_updated',jsonb_build_object('content_count',v_position,'total',v_total));
end;
$$;

revoke all on function public.save_invoice(uuid,uuid,uuid,text,text,date,date,public.invoice_status,uuid,jsonb) from public;
grant execute on function public.save_invoice(uuid,uuid,uuid,text,text,date,date,public.invoice_status,uuid,jsonb) to authenticated;

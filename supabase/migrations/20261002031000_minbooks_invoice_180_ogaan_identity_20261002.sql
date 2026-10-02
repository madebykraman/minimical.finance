-- Historical invoice identity correction: Invoice 180 was billed to Ogaan Media Pvt. Ltd.
-- Idempotent production correction; the renderer only uses issued snapshots.
do $$
declare v_client uuid;
begin
  select id into v_client from public.clients
  where organization_id='fc9a2161-8174-41b3-aaf6-3d88c2f8ce52'::uuid
    and lower(legal_name)=lower('Ogaan Media Pvt. Ltd.')
  limit 1;

  if v_client is null then
    insert into public.clients(organization_id,name,legal_name,address_lines,pan,gstin)
    values (
      'fc9a2161-8174-41b3-aaf6-3d88c2f8ce52'::uuid,
      'Ogaan Media Pvt. Ltd.',
      'Ogaan Media Pvt. Ltd.',
      '["Floor 11, A-1102, Naman Midtown","Senapati Bapat Marg, Nr India Bulls","Prabhadevi, Mumbai City"]'::jsonb,
      'AAACO1078K',
      '27AAACO1078K1ZB'
    )
    returning id into v_client;
  else
    update public.clients set
      name='Ogaan Media Pvt. Ltd.',
      legal_name='Ogaan Media Pvt. Ltd.',
      address_lines='["Floor 11, A-1102, Naman Midtown","Senapati Bapat Marg, Nr India Bulls","Prabhadevi, Mumbai City"]'::jsonb,
      pan='AAACO1078K',
      gstin='27AAACO1078K1ZB',
      updated_at=now()
    where id=v_client;
  end if;

  update public.invoices
  set client_id=v_client, project_id=null, updated_at=now()
  where invoice_number='180'
    and organization_id='fc9a2161-8174-41b3-aaf6-3d88c2f8ce52'::uuid;
end $$;
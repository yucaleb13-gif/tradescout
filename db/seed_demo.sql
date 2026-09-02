-- TradeScout DEMO seed. CLEARLY MARKED DEMO DATA.
-- Rules honored: no real people's contacts (contacts are NULL),
-- no fake URL pretending to be a real source (domain = demo.tradescout.local),
-- demo never marked verification_status='verified', and flagged is_demo=true.
-- Delete anytime with:  delete from public.sources where is_demo; (cascades leads via source? no) 

-- one clearly-demo source (inactive, trust 0)
insert into public.sources (id, domain, name, base_url, source_type, is_active, trust_level, is_demo)
values ('00000000-0000-0000-0000-0000000000d0','demo.tradescout.local','DEMO Source (Sample Data Only)','https://demo.tradescout.local','other', false, 0, true)
on conflict (domain) do nothing;

insert into public.leads
  (id, primary_source_id, source_url, project_name, trade_category, project_type, location, address,
   project_description, tender_status, source_stated_value, source_stated_value_currency,
   estimated_trade_value, estimated_trade_value_currency, estimation_method, estimation_confidence,
   lead_score, verification_status, is_demo)
values
 ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d0','https://demo.tradescout.local/demo/1',
  '[DEMO] Community Centre Window Replacement','windows_doors','Institutional','Sample City','—',
  'Sample demo record used only to preview the interface. Not a real opportunity.','open',
  1200000,'USD', 240000,'USD','trade_percentage_of_project',0.4, 82,'needs_review', true),
 ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d0','https://demo.tradescout.local/demo/2',
  '[DEMO] Warehouse Roofing Renewal','roofing','Industrial','Sample City',null,
  'Sample demo record used only to preview the interface. Not a real opportunity.','closing_soon',
  null,null, 180000,'USD','sqft_heuristic',0.3, 71,'unverified', true),
 ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000d0','https://demo.tradescout.local/demo/3',
  '[DEMO] Residential Subdivision HVAC','hvac','Residential','Sample Town',null,
  'Sample demo record used only to preview the interface. Not a real opportunity.','open',
  850000,'USD', 95000,'USD','historical_comparable',0.5, 64,'needs_review', true),
 ('00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000d0','https://demo.tradescout.local/demo/4',
  '[DEMO] Office Tower Building Envelope','building_envelope','Commercial','Sample City',null,
  'Sample demo record used only to preview the interface. Not a real opportunity.','open',
  4500000,'USD', 900000,'USD','trade_percentage_of_project',0.45, 90,'needs_review', true),
 ('00000000-0000-0000-0000-0000000000e5','00000000-0000-0000-0000-0000000000d0','https://demo.tradescout.local/demo/5',
  '[DEMO] Municipal Parking Concrete Works','concrete','Infrastructure','Sample County',null,
  'Sample demo record used only to preview the interface. Not a real opportunity.','open',
  null,null, 320000,'USD','sqft_heuristic',0.35, 58,'unverified', true),
 ('00000000-0000-0000-0000-0000000000e6','00000000-0000-0000-0000-0000000000d0','https://demo.tradescout.local/demo/6',
  '[DEMO] School Electrical Upgrade','electrical','Institutional','Sample Town',null,
  'Sample demo record used only to preview the interface. Not a real opportunity.','closed',
  600000,'USD', 130000,'USD','trade_percentage_of_project',0.4, 77,'needs_review', true)
on conflict (id) do nothing;

-- one evidence row per demo lead (project_name) to preview the evidence UI
insert into public.lead_evidence (lead_id, field_name, source_id, source_url, source_title, source_domain, retrieved_content, extracted_value, extraction_method, confidence)
select l.id, 'project_name', l.primary_source_id, l.source_url, 'DEMO source page', 'demo.tradescout.local',
       'Sample retrieved snippet for preview only.', l.project_name, 'manual', 0.5
from public.leads l where l.is_demo
on conflict do nothing;

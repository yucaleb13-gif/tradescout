-- TradeScout Phase 1 schema (PostgreSQL / Supabase)
-- Idempotent-ish: safe to re-run.

create extension if not exists pg_trgm;

-- ------------------------------------------------------------------ enums
do $$ begin
  if not exists (select 1 from pg_type where typname='trade_category') then
    create type trade_category as enum (
      'windows_doors','siding','roofing','renovations','building_envelope',
      'hvac','electrical','plumbing','concrete','landscaping','other');
  end if;
  if not exists (select 1 from pg_type where typname='source_type') then
    create type source_type as enum (
      'government_tender','municipal_portal','permit_database','procurement_portal',
      'rss_feed','news','company_site','other');
  end if;
  if not exists (select 1 from pg_type where typname='run_status') then
    create type run_status as enum ('queued','running','completed','partial','failed','cancelled');
  end if;
  if not exists (select 1 from pg_type where typname='verification_status') then
    create type verification_status as enum ('unverified','pending','needs_review','verified','rejected');
  end if;
  if not exists (select 1 from pg_type where typname='tender_status') then
    create type tender_status as enum ('open','closing_soon','closed','awarded','cancelled','unknown');
  end if;
  if not exists (select 1 from pg_type where typname='evidence_field') then
    create type evidence_field as enum (
      'project_name','location','address','company_name','contact_name',
      'contact_email','contact_phone','project_value','timeline',
      'tender_status','project_description','trade_category');
  end if;
  if not exists (select 1 from pg_type where typname='extraction_method') then
    create type extraction_method as enum ('regex','css_selector','structured_data','pdf_parse','llm_extraction','manual');
  end if;
  if not exists (select 1 from pg_type where typname='value_estimation_method') then
    create type value_estimation_method as enum ('source_stated','sqft_heuristic','trade_percentage_of_project','historical_comparable','manual');
  end if;
end $$;

-- --------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  full_name    text,
  company_name text,
  trade_focus  trade_category[] default '{}',
  region       text,
  plan_tier    text default 'free',
  is_admin     boolean default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- sources
create table if not exists public.sources (
  id             uuid primary key default gen_random_uuid(),
  domain         text not null unique,
  name           text not null,
  base_url       text,
  source_type    source_type not null default 'other',
  is_active      boolean default true,
  robots_allowed boolean,
  terms_ok       boolean,
  trust_level    smallint default 50 check (trust_level between 0 and 100),
  last_crawled_at timestamptz,
  is_demo        boolean default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_sources_type   on public.sources(source_type);
create index if not exists idx_sources_active on public.sources(is_active);

-- ------------------------------------------------------------ search_runs
create table if not exists public.search_runs (
  id             uuid primary key default gen_random_uuid(),
  initiated_by   uuid references public.profiles(id) on delete set null,
  params         jsonb default '{}'::jsonb,
  trade_filter   trade_category[] default '{}',
  region         text,
  status         run_status not null default 'queued',
  source_ids     uuid[] default '{}',
  leads_found    integer default 0,
  leads_verified integer default 0,
  error_log      jsonb default '[]'::jsonb,
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists idx_runs_status  on public.search_runs(status);
create index if not exists idx_runs_created on public.search_runs(created_at desc);

-- ------------------------------------------------------------------ leads
create table if not exists public.leads (
  id                uuid primary key default gen_random_uuid(),
  search_run_id     uuid references public.search_runs(id) on delete set null,
  primary_source_id uuid references public.sources(id) on delete restrict,
  source_url        text not null,
  -- factual fields (nullable by design; unknown => NULL, never guessed)
  project_name        text,
  trade_category      trade_category,
  project_type        text,
  location            text,
  address             text,
  company_name        text,
  contact_name        text,
  contact_email       text,
  contact_phone       text,
  project_description  text,
  timeline_text       text,
  timeline_start      date,
  timeline_end        date,
  tender_status       tender_status default 'unknown',
  -- value: source-stated vs estimate kept strictly separate
  source_stated_value            numeric,
  source_stated_value_currency   text,
  estimated_trade_value          numeric,
  estimated_trade_value_currency text,
  estimation_method              value_estimation_method,
  estimation_confidence          numeric check (estimation_confidence between 0 and 1),
  lead_score          smallint check (lead_score between 0 and 100),
  -- verification
  verification_status verification_status not null default 'unverified',
  verified_at         timestamptz,
  -- AI outputs (derived, NOT source of truth)
  ai_summary          text,
  ai_classification   jsonb,
  ai_model            text,
  ai_generated_at     timestamptz,
  -- dedup / lineage
  dedup_hash          text,
  is_demo             boolean default false,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_leads_trade   on public.leads(trade_category);
create index if not exists idx_leads_status  on public.leads(verification_status);
create index if not exists idx_leads_source  on public.leads(primary_source_id);
create index if not exists idx_leads_dedup   on public.leads(dedup_hash);
create index if not exists idx_leads_created on public.leads(created_at desc);
create index if not exists idx_leads_name_trgm on public.leads using gin (project_name gin_trgm_ops);
create index if not exists idx_leads_addr_trgm on public.leads using gin (address gin_trgm_ops);

-- ---------------------------------------------------------- lead_evidence
create table if not exists public.lead_evidence (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid not null references public.leads(id) on delete cascade,
  field_name        evidence_field not null,
  source_id         uuid references public.sources(id) on delete restrict,
  source_url        text not null,
  source_title      text,
  source_domain     text not null,
  retrieved_content text,
  content_ref       text,
  extracted_value   text,
  extraction_method extraction_method not null default 'manual',
  confidence        numeric check (confidence between 0 and 1),
  content_hash      text,
  retrieved_at      timestamptz not null default now(),
  created_at        timestamptz not null default now()
);
create index if not exists idx_evidence_lead   on public.lead_evidence(lead_id);
create index if not exists idx_evidence_field  on public.lead_evidence(lead_id, field_name);
create index if not exists idx_evidence_domain on public.lead_evidence(source_domain);

-- ------------------------------------------------------------ saved_leads
create table if not exists public.saved_leads (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  lead_id    uuid not null references public.leads(id) on delete cascade,
  status     text default 'New',
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, lead_id)
);
create index if not exists idx_saved_profile on public.saved_leads(profile_id);

-- --------------------------------------------------------- search_history
create table if not exists public.search_history (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  query_text    text,
  filters       jsonb default '{}'::jsonb,
  search_run_id uuid references public.search_runs(id) on delete set null,
  result_count  integer default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_history_profile on public.search_history(profile_id, created_at desc);

-- -------------------------------------------------- auto-create profiles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, company_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'company_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------- RLS
alter table public.profiles      enable row level security;
alter table public.sources       enable row level security;
alter table public.search_runs   enable row level security;
alter table public.leads         enable row level security;
alter table public.lead_evidence enable row level security;
alter table public.saved_leads   enable row level security;
alter table public.search_history enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- profiles: owner only
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- sources: readable by all authenticated; writes via service role only (no policy)
drop policy if exists "sources_select_auth" on public.sources;
create policy "sources_select_auth" on public.sources for select to authenticated using (true);

-- leads: readable by all authenticated; writes via service role only (no insert/update policy)
drop policy if exists "leads_select_auth" on public.leads;
create policy "leads_select_auth" on public.leads for select to authenticated using (true);

-- lead_evidence: readable by all authenticated; writes via service role only
drop policy if exists "evidence_select_auth" on public.lead_evidence;
create policy "evidence_select_auth" on public.lead_evidence for select to authenticated using (true);

-- search_runs: user sees own runs
drop policy if exists "runs_select_own" on public.search_runs;
create policy "runs_select_own" on public.search_runs for select to authenticated using ((select auth.uid()) = initiated_by);
drop policy if exists "runs_insert_own" on public.search_runs;
create policy "runs_insert_own" on public.search_runs for insert to authenticated with check ((select auth.uid()) = initiated_by);

-- saved_leads: owner only (all ops)
drop policy if exists "saved_select_own" on public.saved_leads;
create policy "saved_select_own" on public.saved_leads for select to authenticated using ((select auth.uid()) = profile_id);
drop policy if exists "saved_insert_own" on public.saved_leads;
create policy "saved_insert_own" on public.saved_leads for insert to authenticated with check ((select auth.uid()) = profile_id);
drop policy if exists "saved_update_own" on public.saved_leads;
create policy "saved_update_own" on public.saved_leads for update to authenticated using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);
drop policy if exists "saved_delete_own" on public.saved_leads;
create policy "saved_delete_own" on public.saved_leads for delete to authenticated using ((select auth.uid()) = profile_id);

-- search_history: owner only
drop policy if exists "history_select_own" on public.search_history;
create policy "history_select_own" on public.search_history for select to authenticated using ((select auth.uid()) = profile_id);
drop policy if exists "history_insert_own" on public.search_history;
create policy "history_insert_own" on public.search_history for insert to authenticated with check ((select auth.uid()) = profile_id);
drop policy if exists "history_delete_own" on public.search_history;
create policy "history_delete_own" on public.search_history for delete to authenticated using ((select auth.uid()) = profile_id);

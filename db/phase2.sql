-- TradeScout Phase 2: ingestion + verification engine schema

-- sources: connector + config
alter table public.sources add column if not exists connector text default 'generic_web';
alter table public.sources add column if not exists config jsonb default '{}'::jsonb;

-- search_runs: pipeline run stats
alter table public.search_runs add column if not exists connector text;
alter table public.search_runs add column if not exists leads_rejected integer default 0;
alter table public.search_runs add column if not exists leads_duplicated integer default 0;
alter table public.search_runs add column if not exists summary jsonb default '{}'::jsonb;

-- leads: bid deadline + retrieval linkage + content hash
alter table public.leads add column if not exists bid_deadline date;
alter table public.leads add column if not exists content_hash text;

-- retrievals: raw source retrieval log (SOURCE -> RETRIEVE)
create table if not exists public.retrievals (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid references public.search_runs(id) on delete cascade,
  source_id         uuid references public.sources(id) on delete set null,
  source_url        text not null,
  source_domain     text,
  source_title      text,
  http_status       integer,
  retrieval_status  text not null default 'pending', -- success | failed | empty
  content_hash      text,
  raw_content       text,
  byte_size         integer,
  error             text,
  retrieved_at      timestamptz not null default now()
);
create index if not exists idx_retrievals_run on public.retrievals(run_id);

alter table public.leads add column if not exists retrieval_id uuid references public.retrievals(id) on delete set null;

-- pipeline_logs: per-step logging (every step must be logged)
create table if not exists public.pipeline_logs (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid references public.search_runs(id) on delete cascade,
  retrieval_id  uuid references public.retrievals(id) on delete set null,
  lead_id       uuid references public.leads(id) on delete set null,
  step          text not null,   -- source | retrieve | extract | normalize | evidence | validate | lead | dedup
  status        text not null,   -- ok | skip | fail
  message       text,
  meta          jsonb default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_plogs_run on public.pipeline_logs(run_id, created_at);

-- RLS: readable by authenticated (internal/debug view); writes via service role only
alter table public.retrievals enable row level security;
alter table public.pipeline_logs enable row level security;
grant select, insert, update, delete on public.retrievals to authenticated;
grant select, insert, update, delete on public.pipeline_logs to authenticated;

drop policy if exists "retrievals_select_auth" on public.retrievals;
create policy "retrievals_select_auth" on public.retrievals for select to authenticated using (true);
drop policy if exists "plogs_select_auth" on public.pipeline_logs;
create policy "plogs_select_auth" on public.pipeline_logs for select to authenticated using (true);

-- allow authenticated to see all search_runs (admin/debug), in addition to own
drop policy if exists "runs_select_auth" on public.search_runs;
create policy "runs_select_auth" on public.search_runs for select to authenticated using (true);

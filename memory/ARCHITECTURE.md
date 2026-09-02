# TradeScout — Technical Architecture & Data Model (Design Phase)

Status: DESIGN ONLY — awaiting approval before implementation.
Stack target: PostgreSQL / Supabase (Postgres + Auth + RLS + Storage).

--------------------------------------------------------------------------------
## 0. CORE PRINCIPLE (drives every design decision)

TradeScout NEVER fabricates lead information.
- Every factual field is traceable to actual retrieved source evidence.
- Unknown → NULL/empty, never a guess.
- AI is NEVER the source of truth. AI may only summarize/classify content that
  was already retrieved from a source; it may not invent missing facts.
- "Source-stated value" and "estimated trade opportunity value" are separate
  fields and are never merged or presented interchangeably.

Pipeline (one-directional, evidence-first):

  SOURCE → RETRIEVAL → EXTRACTION → EVIDENCE → VALIDATION
         → STRUCTURED LEAD → AI SUMMARY → USER

Explicitly forbidden path:

  USER SEARCH → AI MAKES UP LEAD        (blocked by architecture, not policy)

--------------------------------------------------------------------------------
## 1. DATABASE SCHEMA

### 1.1 Enumerated types

```sql
create type trade_category as enum (
  'windows_doors','siding','roofing','renovations','building_envelope',
  'hvac','electrical','plumbing','concrete','landscaping','other'
);

create type source_type as enum (
  'government_tender','municipal_portal','permit_database','procurement_portal',
  'rss_feed','news','company_site','other'
);

create type run_status as enum (
  'queued','running','completed','partial','failed','cancelled'
);

-- Lead lifecycle vs. tender lifecycle are DIFFERENT concepts, kept separate.
create type verification_status as enum (
  'unverified',   -- extracted but not yet validated
  'pending',      -- in validation queue
  'needs_review', -- failed automated checks, human review needed
  'verified',     -- passed validation, every non-null fact has evidence
  'rejected'      -- validation failed / source not trustworthy
);

create type tender_status as enum (
  'open','closing_soon','closed','awarded','cancelled','unknown'
);

-- Which factual field a piece of evidence supports
create type evidence_field as enum (
  'project_name','location','address','company_name','contact_name',
  'contact_email','contact_phone','project_value','timeline',
  'tender_status','project_description','trade_category'
);

create type extraction_method as enum (
  'regex','css_selector','structured_data','pdf_parse',
  'llm_extraction','manual'
);

create type value_estimation_method as enum (
  'source_stated',        -- NOT an estimate; mirrors evidence
  'sqft_heuristic','trade_percentage_of_project','historical_comparable','manual'
);
```

### 1.2 `profiles`
Extends Supabase `auth.users`. Holds trade focus & preferences.

```sql
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  full_name     text,
  company_name  text,
  trade_focus   trade_category[] default '{}',   -- trades user cares about
  region        text,                            -- default region filter
  plan_tier     text default 'free',             -- free / pro / enterprise
  is_admin      boolean default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
```

### 1.3 `sources`
Registry of legitimate, publicly accessible sources. A lead cannot exist
without pointing at a source row. Governs trust & compliance.

```sql
create table sources (
  id             uuid primary key default gen_random_uuid(),
  domain         text not null unique,            -- e.g. 'bids.example.gov'
  name           text not null,                   -- human title of the source
  base_url       text,
  source_type    source_type not null default 'other',
  is_active      boolean default true,
  robots_allowed boolean,                          -- crawl compliance flag
  terms_ok       boolean,                          -- ToS review flag
  trust_level    smallint default 50 check (trust_level between 0 and 100),
  last_crawled_at timestamptz,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
create index idx_sources_type   on sources(source_type);
create index idx_sources_active on sources(is_active);
```

### 1.4 `search_runs`
Every discovery execution (system-scheduled or user-triggered). This is the
audit spine of the retrieval pipeline.

```sql
create table search_runs (
  id            uuid primary key default gen_random_uuid(),
  initiated_by  uuid references profiles(id) on delete set null,  -- null = system
  params        jsonb default '{}'::jsonb,        -- query, keywords, geo, etc.
  trade_filter  trade_category[] default '{}',
  region        text,
  status        run_status not null default 'queued',
  source_ids    uuid[] default '{}',              -- sources targeted this run
  leads_found   integer default 0,
  leads_verified integer default 0,
  error_log     jsonb default '[]'::jsonb,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz default now()
);
create index idx_runs_status on search_runs(status);
create index idx_runs_created on search_runs(created_at desc);
```

### 1.5 `leads`
The structured, canonical lead. EVERY factual field is NULLABLE by design so
"unknown" is representable. Values & AI outputs are kept structurally distinct.

```sql
create table leads (
  id                 uuid primary key default gen_random_uuid(),
  search_run_id      uuid references search_runs(id) on delete set null,
  primary_source_id  uuid references sources(id) on delete restrict,
  source_url         text not null,               -- specific page the lead came from

  -- FACTUAL FIELDS (nullable; only filled when evidence exists)
  project_name        text,
  trade_category      trade_category,
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

  -- VALUE (source-stated ≠ estimate; kept separate & explicit)
  source_stated_value           numeric,
  source_stated_value_currency  text,
  estimated_trade_value         numeric,          -- TradeScout estimate ONLY
  estimated_trade_value_currency text,
  estimation_method             value_estimation_method,
  estimation_confidence         numeric check (estimation_confidence between 0 and 1),

  -- VERIFICATION
  verification_status verification_status not null default 'unverified',
  verified_at         timestamptz,

  -- AI (derived, NOT source of truth — clearly namespaced)
  ai_summary          text,
  ai_classification   jsonb,                       -- {trade, tags, confidence}
  ai_model            text,                        -- model + version used
  ai_generated_at     timestamptz,

  -- DEDUP / LINEAGE
  dedup_hash          text,                        -- normalized fingerprint
  first_seen_at       timestamptz default now(),
  last_seen_at        timestamptz default now(),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index idx_leads_trade    on leads(trade_category);
create index idx_leads_status    on leads(verification_status);
create index idx_leads_source    on leads(primary_source_id);
create index idx_leads_dedup     on leads(dedup_hash);
create index idx_leads_created    on leads(created_at desc);
-- fuzzy matching for dedup + text search (requires pg_trgm)
create index idx_leads_name_trgm  on leads using gin (project_name gin_trgm_ops);
create index idx_leads_addr_trgm  on leads using gin (address gin_trgm_ops);
```

### 1.6 `lead_evidence`
The heart of data integrity. One row per (lead, field) fact proving where each
value came from. A `verified` lead must have evidence for every non-null fact.

```sql
create table lead_evidence (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid not null references leads(id) on delete cascade,
  field_name        evidence_field not null,      -- which fact this proves
  source_id         uuid references sources(id) on delete restrict,

  -- Required source provenance
  source_url        text not null,
  source_title      text,
  source_domain     text not null,
  retrieved_content text,                          -- raw snippet backing the fact
  content_ref       text,                          -- Supabase Storage key to full HTML/PDF snapshot

  extracted_value   text,                          -- value pulled for field_name
  extraction_method extraction_method not null,
  confidence        numeric check (confidence between 0 and 1),
  content_hash      text,                          -- hash of retrieved_content
  retrieved_at      timestamptz not null default now(),
  created_at        timestamptz default now()
);
create index idx_evidence_lead  on lead_evidence(lead_id);
create index idx_evidence_field on lead_evidence(lead_id, field_name);
create index idx_evidence_domain on lead_evidence(source_domain);
```

### 1.7 `saved_leads`
User bookmarks / CRM-lite state. Owner-scoped.

```sql
create table saved_leads (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  lead_id    uuid not null references leads(id) on delete cascade,
  status     text default 'interested',   -- interested / contacted / won / archived
  notes      text,
  created_at timestamptz default now(),
  unique (profile_id, lead_id)
);
create index idx_saved_profile on saved_leads(profile_id);
```

### 1.8 `search_history`
User-facing record of searches (distinct from the pipeline's search_runs).

```sql
create table search_history (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles(id) on delete cascade,
  query_text    text,
  filters       jsonb default '{}'::jsonb,
  search_run_id uuid references search_runs(id) on delete set null,
  result_count  integer default 0,
  created_at    timestamptz default now()
);
create index idx_history_profile on search_history(profile_id, created_at desc);
```

--------------------------------------------------------------------------------
## 2. ENTITY RELATIONSHIPS

```
auth.users 1───1 profiles
profiles   1───* search_history
profiles   1───* saved_leads          *───1 leads
profiles   1───* search_runs (initiated_by, nullable = system)

sources    1───* search_runs (via source_ids[])
sources    1───* leads       (primary_source_id)
sources    1───* lead_evidence (source_id)

search_runs 1───* leads
leads       1───* lead_evidence   (ON DELETE CASCADE)
leads       *───* profiles        (through saved_leads)
```

Cardinality notes:
- A lead has exactly one `primary_source_id` but MANY evidence rows (one per fact,
  and multiple sources can corroborate the same fact).
- Deleting a lead cascades its evidence (evidence is meaningless without the lead).
- Deleting a source is RESTRICTED while leads/evidence reference it (protect lineage).

--------------------------------------------------------------------------------
## 3. VERIFICATION ARCHITECTURE

State machine on `leads.verification_status`:

  unverified → pending → (needs_review ⇄ pending) → verified | rejected

Automated validation gate (runs in VALIDATION stage). A lead may become
`verified` only if ALL of the following pass:
1. `primary_source_id` is set and its source `is_active` and `trust_level ≥ threshold`.
2. `source_url` is non-empty and belongs to the source's domain.
3. For EVERY non-null factual field on the lead, there is at least one
   `lead_evidence` row with matching `field_name` and non-empty `retrieved_content`.
4. `estimated_trade_value`, if present, has an `estimation_method` and is NOT
   copied into `source_stated_value`.
5. Contact fields (email/phone) pass format sanity checks (else set NULL, never guess).

Enforcement is dual-layer:
- Application service performs the checks and writes status + `verified_at`.
- A DB trigger (defense-in-depth) rejects any UPDATE setting
  `verification_status='verified'` when rule (3) is violated:

```sql
-- pseudocode of trigger logic
for each non-null factual column c in NEW:
    require exists (select 1 from lead_evidence e
                    where e.lead_id = NEW.id and e.field_name = field_for(c));
```

Leads failing checks go to `needs_review` (human) or `rejected`, never silently verified.

--------------------------------------------------------------------------------
## 4. SOURCE ARCHITECTURE

- Only sources present in `sources` and marked `is_active` may feed the pipeline.
- Compliance flags (`robots_allowed`, `terms_ok`) gate whether retrieval is allowed.
- `trust_level` (0–100) influences verification threshold and ranking.
- `source_type` classifies legitimacy (government_tender / municipal_portal /
  permit_database / procurement_portal / rss_feed / news / company_site / other).
- Every lead AND every evidence row carries its source lineage
  (`source_id`, `source_url`, `source_domain`), so provenance is queryable end-to-end.
- No lead can be created without an existing `sources` row (FK enforced).

--------------------------------------------------------------------------------
## 5. SEARCH-RUN ARCHITECTURE

- `search_runs` is the orchestration + audit record for each RETRIEVAL execution.
- Lifecycle: queued → running → completed | partial | failed | cancelled.
- Records params, targeted `source_ids[]`, counts (found/verified), and `error_log`.
- User-triggered runs link back via `search_history.search_run_id`; scheduled/system
  runs have `initiated_by = NULL`.
- Every lead references the run that produced it (`leads.search_run_id`), giving full
  "where did this come from" traceability and enabling reproducible re-runs.
- Runs are the natural unit for rate-limiting, retries, and per-source crawl budgets.

--------------------------------------------------------------------------------
## 6. HOW EVIDENCE IS STORED

- Structured provenance in `lead_evidence` (URL, title, domain, extracted value,
  method, confidence, retrieved_at, content_hash).
- The exact backing snippet is stored in `retrieved_content`.
- The FULL raw artifact (HTML/PDF snapshot at retrieval time) is stored in Supabase
  Storage and referenced by `content_ref` — this preserves an immutable copy even if
  the live page changes or disappears (critical for "traceable to source evidence").
- One fact can have multiple evidence rows (corroboration / multi-source).
- `content_hash` allows detecting when re-crawls return identical vs changed content.

--------------------------------------------------------------------------------
## 7. DUPLICATE DETECTION (future-ready, designed now)

Two layers:
1. Exact: `leads.dedup_hash` = hash of normalized key fields
   (lower/trimmed project_name + address + primary_source domain). Fast unique-ish check.
2. Fuzzy / cross-source: `pg_trgm` GIN indexes on `project_name` and `address` +
   similarity() scoring, combined with geo (location) proximity, to catch the same
   real-world project listed on different sources or with slight text differences.

On ingest, a new candidate is compared; if it matches an existing lead it is MERGED:
`last_seen_at` updated and any NEW corroborating evidence appended (rather than creating
a duplicate). A future `lead_duplicates` link table can record confirmed merges/aliases.

--------------------------------------------------------------------------------
## 8. HOW HALLUCINATED DATA IS PREVENTED (structural, not just policy)

1. Factual fields are NULLABLE — "unknown" is a first-class value; nothing forces a guess.
2. FK from `leads`/`lead_evidence` to `sources` — a lead cannot exist without a real source.
3. `source_url` is NOT NULL on leads and evidence — every fact points at a real page.
4. Verification trigger — a lead cannot be `verified` unless every non-null fact has
   backing evidence (DB-enforced, independent of application code).
5. AI outputs are quarantined in dedicated columns (`ai_summary`, `ai_classification`,
   `ai_model`, `ai_generated_at`) and never written into factual columns. The extraction
   step may use an LLM, but its output must be persisted as `lead_evidence` with the
   originating `retrieved_content` — i.e. AI can only restate what the source contained.
6. Value integrity — `source_stated_value` vs `estimated_trade_value` are separate,
   and estimates require `estimation_method`, so an estimate can never masquerade as fact.
7. Immutable raw snapshot (`content_ref` in Storage) makes every claim auditable.

--------------------------------------------------------------------------------
## 9. ROW LEVEL SECURITY (RLS) CONSIDERATIONS

Enable RLS on all tables. Summary of intended policies:

- profiles:        user can SELECT/UPDATE only their own row (id = auth.uid()).
- saved_leads:     owner-only for all operations (profile_id = auth.uid()).
- search_history:  owner-only for all operations (profile_id = auth.uid()).
- leads:           SELECT for authenticated users (shared discovery feed; may be
                   gated by plan_tier later). INSERT/UPDATE/DELETE only via service role
                   (the pipeline). No client writes.
- lead_evidence:   SELECT for authenticated users; writes service-role only.
- sources:         SELECT for authenticated; writes service-role/admin only.
- search_runs:     SELECT own runs (initiated_by = auth.uid()) + admins see all;
                   writes service-role only.

The RETRIEVAL/EXTRACTION/VALIDATION pipeline runs with the service role (bypasses RLS)
so users can never inject or mutate leads/evidence directly. Users only read verified
data and manage their own saved_leads/search_history.

--------------------------------------------------------------------------------
## 10. RECOMMENDED IMPLEMENTATION ORDER

Phase 1 — Foundation
  1. Enums + `sources` + `profiles` tables, RLS, Supabase Auth wiring.
  2. Seed the `sources` registry with REAL, compliance-checked public sources
     (manually reviewed — no fabricated sources).

Phase 2 — Pipeline spine (hardest part first)
  3. `search_runs` orchestration + a single real source RETRIEVAL adapter.
  4. `lead_evidence` + Storage snapshot on `content_ref`.
  5. EXTRACTION (deterministic first: structured_data/regex/css) writing evidence.

Phase 3 — Leads + integrity
  6. `leads` table + dedup_hash + the verification trigger.
  7. VALIDATION service implementing the verification state machine.

Phase 4 — AI layer (last, and boxed in)
  8. AI SUMMARY / classification writing ONLY to ai_* columns, sourced from evidence.

Phase 5 — User surface
  9. `saved_leads`, `search_history`, read APIs (verified leads only), then UI.

Phase 6 — Scale
  10. pg_trgm fuzzy dedup, scheduled runs, per-source crawl budgets, plan gating.

Rationale: build and prove the SOURCE→EVIDENCE→VALIDATION integrity core BEFORE any
AI or UI, so hallucination is impossible by construction. AI and UI are added last on
top of an already-trustworthy substrate.

--------------------------------------------------------------------------------
NOTE: No fake data and no fake sources have been created. `sources` will be seeded
only with real, reviewed public sources during Phase 1 after approval.

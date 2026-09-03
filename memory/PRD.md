# TradeScout — Product Requirements & Status

## Core principle
Never fabricate lead data. Every non-null factual field traces to a `lead_evidence` row pointing at a real retrieved document. Unknown = NULL. AI is never a source of truth.

Pipeline: SOURCE → ROBOTS → RETRIEVE → EXTRACT → (DETAIL) → EVIDENCE → VALIDATE → STRUCTURED LEAD → (Phase 3+: AI SUMMARY) → USER

## Phase status
- Phase 1 (foundation: Supabase auth, dashboard, discover, saved leads Kanban/list, lead detail, sources, search history, settings) — DONE, backend + UI tested.
- Phase 2 (ingestion + verification engine: connector registry, `generic_web` RSS/Atom/HTML connector, deterministic NO-AI extraction, per-field evidence, validation state machine, dedup via combination hash, retrievals + pipeline_logs, Admin/Debug UI) — DONE, backend + UI tested.
- Phase 2+ enhancements (this session) — DONE, backend + UI tested:
  - robots.txt guard (`app/lib/pipeline/robots.js`): RFC 9309 longest-match; disallowed → run `failed`, retrieval `blocked`, no leads; honours `Crawl-delay` (capped 10s); `sources.robots_allowed` + `last_crawled_at` set by engine.
  - Purge test data (`app/lib/pipeline/purge.js`): `POST /api/admin/purge {run_id|source_id}`, `DELETE /api/sources/:id`; demo source protected.
  - Scheduled runs (`app/lib/pipeline/scheduler.js`): `sources.config.schedule_minutes`; `POST /api/admin/run-due`, `GET /api/admin/due`, `GET /api/cron/run-due` (header `x-cron-secret` = `CRON_SECRET` in .env); in-process 60s ticker for long-lived server.
  - Detail fetch (`sources.config.fetch_details`, `max_detail_fetch` ≤ 25, 40s time budget): item pages retrieved (robots-checked, HTML only), extra evidence only for fields the feed did not state, dedup hash unaffected.
- Phase 3 (first real data source) — DONE, backend + UI tested:
  - Source: **CanadaBuys – Open Tender Notices** (official Gov. of Canada open-data CSV, Open Government Licence – Canada; user approved licensed access basis; website robots.txt disallows generic crawling — recorded on every run as a 'robots' log line, never silent). Facebook (user-pasted) rejected: login-gated, ToS forbids automated collection.
  - `csv_dataset` connector (`app/lib/connectors/csvDataset.js`): slice-based RFC4180 parser keeping only mapped columns (24 MB / 16 ms for 7 MB file); every lead field = a named CSV column; lead URL = noticeURL column or documented CanadaBuys notice-page pattern from referenceNumber.
  - Deterministic search filters (`app/lib/connectors/query.js`): trade keywords with leading word boundary ("door" ≠ "indoor"), location parts AND-ed with curated Fraser Valley/BC aliases (matched in location columns; only as capitalised proper nouns in prose), project_type text, publication date range, limit ≤ 20.
  - `POST /api/discover/search` runs up to 4 active sources (trust-ordered, skipping known robots-blocked), returns leads + evidence (new + already-known duplicates), writes search_history with run link. Discover UI shows Project / Source / URL / Fields / Evidence / Verification with expandable evidence panel and explicit zero-result message.
  - Verification states now: verified / unverified / rejected (needs_review no longer produced).
  - Canonical test (Windows & Doors, Fraser Valley BC): 978 rows retrieved, 36 trade hits, 2 matched, 2 verified, 0 rejected, 0 fabricated. Missing most often: source-stated value (dataset never publishes), address (not mapped by design), contact phone (~50%).
- Phase 4 (source-grounded AI processing) — DONE, backend + UI tested:
  - `app/lib/ai/grounded.js` via `emergentintegrations` (Emergent LLM key, provider openai, model `gpt-4o-mini`, env `EMERGENT_LLM_KEY`, `EMERGENT_MODEL`). Input = ONLY lead fields + evidence snippets + source URL. Output JSON validated deterministically: numbers/money in summary must exist in source text (unit-normalised), no contact details, no speculative phrasing, enum-checked classifications must cite real evidence ids (confident-without-evidence = invalid). One corrective retry, sequential calls with backoff (proxy has a concurrency limit), transient failures retried by scheduler.
  - Stored ONLY in `leads.ai_summary / ai_classification (schema tradescout.ai.v1: input_snapshot, evidence refs, trade/project-type classification, relevance fit, evidence groups, unknowns, model, timestamps, validator notes) / ai_model / ai_generated_at`. Factual columns never touched; failures recorded (`status: failed`) with lead intact; `pipeline_logs` step `ai`.
  - Endpoints: `POST /api/ai/leads/:id`, `POST /api/ai/process-pending`; auto-run (20 s budget) after `discover/search`; scheduler catch-up (5/min). UI: AI analysis card on lead detail (Generate/Regenerate, failed state), AI summary block in Discover results. Demo/rejected leads skipped.
- Phase 5+ — awaiting user prompt.

## Environment notes
- Next dev server runs with a 512 MB heap cap and a memory watchdog that occasionally restarts the worker (brief ECONNREFUSED); production build would not have this.
- No psql/DB connection string available in the workspace — schema changes need the Supabase DB password from the user (none were required for Phase 3).

## Live sources
- Google News RSS `/rss/search` is DISALLOWED by news.google.com/robots.txt → correctly blocked by the guard (earlier Phase 2 test data from it was purged).
- Real permitted source in use: Construction Dive – News, `https://www.constructiondive.com/feeds/news/` (robots allows, Crawl-delay 5). Article pages return HTTP 403 to the bot → detail fetch logs `fail`, nothing invented.

## Known minor
- Console warning: `<div>` nested in `<p>` somewhere in UI (cosmetic).
- `/app/app/api/[[...path]]/route.js` monolith (~430 lines) — split into per-resource route files when Phase 3 grows it.

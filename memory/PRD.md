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
- Phase 3+ — awaiting user prompt.

## Live sources
- Google News RSS `/rss/search` is DISALLOWED by news.google.com/robots.txt → correctly blocked by the guard (earlier Phase 2 test data from it was purged).
- Real permitted source in use: Construction Dive – News, `https://www.constructiondive.com/feeds/news/` (robots allows, Crawl-delay 5). Article pages return HTTP 403 to the bot → detail fetch logs `fail`, nothing invented.

## Known minor
- Console warning: `<div>` nested in `<p>` somewhere in UI (cosmetic).
- `/app/app/api/[[...path]]/route.js` monolith (~430 lines) — split into per-resource route files when Phase 3 grows it.

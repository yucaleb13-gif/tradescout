// Scheduled runs: sources with config.schedule_minutes > 0 are re-ingested when due.
// - runDueSources() is exposed via POST /api/admin/run-due (auth) and GET /api/cron/run-due (CRON_SECRET)
// - ensureScheduler() starts an in-process ticker (dev/long-lived server) that checks every minute.
import { admin } from '@/app/lib/supabase/admin'
import { runPipeline } from '@/app/lib/pipeline/engine'
import { processLeadsAi, listPendingAiLeads } from '@/app/lib/ai/grounded'

const TICK_MS = 60 * 1000
const MAX_PER_TICK = 5

export function isDue(source, now = Date.now()) {
  const mins = Number(source?.config?.schedule_minutes || 0)
  if (!mins || mins <= 0) return false
  if (source.is_active !== true || source.is_demo) return false
  if (!source.last_crawled_at) return true
  return now - new Date(source.last_crawled_at).getTime() >= mins * 60 * 1000
}

export async function listDueSources() {
  const { data } = await admin.from('sources').select('*').eq('is_active', true).eq('is_demo', false)
  return (data || []).filter((s) => isDue(s))
}

let running = false
export async function runDueSources({ limit = MAX_PER_TICK, trigger = 'scheduler' } = {}) {
  if (running) return { skipped: true, reason: 'already_running', results: [] }
  running = true
  try {
    const due = (await listDueSources()).slice(0, limit)
    const results = []
    for (const s of due) {
      try {
        const r = await runPipeline({ sourceId: s.id, userId: null, trigger })
        results.push({ source_id: s.id, source_name: s.name, ...r })
      } catch (e) {
        results.push({ source_id: s.id, source_name: s.name, status: 'failed', error: e.message })
      }
    }
    return { skipped: false, due: due.length, results }
  } finally { running = false }
}

export function ensureScheduler() {
  if (globalThis.__tradescoutScheduler) return
  globalThis.__tradescoutScheduler = setInterval(() => {
    runDueSources()
      .then(async () => { // Phase 4: catch up on leads that still lack a source-grounded AI summary
        const ids = await listPendingAiLeads(5)
        if (ids.length) await processLeadsAi(ids, { concurrency: 1, budgetMs: 45000, trigger: 'scheduler' })
      })
      .catch(() => {})
  }, TICK_MS)
  // do not keep the process alive solely for the timer
  if (typeof globalThis.__tradescoutScheduler.unref === 'function') globalThis.__tradescoutScheduler.unref()
}

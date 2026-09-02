// Purge ingested (test) data. Order respects FK constraints:
// lead_evidence -> leads (saved_leads cascade) -> search_runs (retrievals + pipeline_logs cascade) -> retrievals -> [source]
import { admin } from '@/app/lib/supabase/admin'

const ids = (rows) => (rows || []).map((r) => r.id)

async function deleteLeads(leadIds) {
  if (!leadIds.length) return 0
  // chunk to keep query size reasonable
  for (let i = 0; i < leadIds.length; i += 200) {
    const chunk = leadIds.slice(i, i + 200)
    await admin.from('lead_evidence').delete().in('lead_id', chunk)
    await admin.from('pipeline_logs').update({ lead_id: null }).in('lead_id', chunk)
    await admin.from('saved_leads').delete().in('lead_id', chunk)
    await admin.from('leads').delete().in('id', chunk)
  }
  return leadIds.length
}

export async function purgeRun(runId) {
  const { data: run } = await admin.from('search_runs').select('id').eq('id', runId).single()
  if (!run) throw new Error('Run not found')
  const { data: leadRows } = await admin.from('leads').select('id').eq('search_run_id', runId).eq('is_demo', false)
  const leads = await deleteLeads(ids(leadRows))
  const { count: retrievals } = await admin.from('retrievals').select('*', { count: 'exact', head: true }).eq('run_id', runId)
  const { count: logs } = await admin.from('pipeline_logs').select('*', { count: 'exact', head: true }).eq('run_id', runId)
  await admin.from('search_runs').delete().eq('id', runId) // cascades retrievals + logs
  return { runs: 1, leads, retrievals: retrievals || 0, logs: logs || 0 }
}

export async function purgeSource(sourceId, { deleteSource = false } = {}) {
  const { data: source } = await admin.from('sources').select('id, is_demo, name').eq('id', sourceId).single()
  if (!source) throw new Error('Source not found')
  if (source.is_demo) throw new Error('Demo source data cannot be purged')

  const { data: leadRows } = await admin.from('leads').select('id').eq('primary_source_id', sourceId).eq('is_demo', false)
  const leads = await deleteLeads(ids(leadRows))
  // any evidence still pointing at this source (defensive)
  await admin.from('lead_evidence').delete().eq('source_id', sourceId)

  const { data: runRows } = await admin.from('search_runs').select('id').contains('source_ids', [sourceId])
  const runIds = ids(runRows)
  let retrievals = 0, logs = 0
  if (runIds.length) {
    const { count: rc } = await admin.from('retrievals').select('*', { count: 'exact', head: true }).in('run_id', runIds)
    const { count: lc } = await admin.from('pipeline_logs').select('*', { count: 'exact', head: true }).in('run_id', runIds)
    retrievals = rc || 0; logs = lc || 0
    await admin.from('search_runs').delete().in('id', runIds)
  }
  await admin.from('retrievals').delete().eq('source_id', sourceId)

  let sourceDeleted = false
  if (deleteSource) {
    const { error } = await admin.from('sources').delete().eq('id', sourceId)
    if (error) throw new Error(`Source could not be deleted: ${error.message}`)
    sourceDeleted = true
  } else {
    await admin.from('sources').update({ last_crawled_at: null, updated_at: new Date().toISOString() }).eq('id', sourceId)
  }
  return { source_id: sourceId, source_name: source.name, runs: runIds.length, leads, retrievals, logs, source_deleted: sourceDeleted }
}

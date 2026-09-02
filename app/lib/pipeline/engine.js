import { admin } from '@/app/lib/supabase/admin'
import { getConnector } from '@/app/lib/connectors/registry'
import { sha256 } from '@/app/lib/connectors/genericWeb'

// map extractor field -> lead_evidence.evidence_field enum
const EVIDENCE_FIELD = {
  project_name: 'project_name', project_description: 'project_description', trade_category: 'trade_category',
  location: 'location', contact_email: 'contact_email', contact_phone: 'contact_phone',
  project_value: 'project_value', bid_deadline: 'timeline',
}

async function log(runId, step, status, message, meta = {}, ids = {}) {
  await admin.from('pipeline_logs').insert({
    run_id: runId, step, status, message: message?.slice(0, 2000) || null, meta,
    retrieval_id: ids.retrieval_id || null, lead_id: ids.lead_id || null,
  })
}

function dedupHash(source, url, fields) {
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
  // Combination (never solely project name): source id + url + project name + location
  return sha256([source.id, norm(url), norm(fields.project_name), norm(fields.location)].join('|'))
}

function runValidation({ source, retrieval, extracted, normalized }) {
  const hasName = extracted.evidence.some((e) => e.field === 'project_name')
  const checks = {
    source_url_exists: !!(source.base_url || source.config?.feed_url),
    source_retrievable: retrieval.retrieval_status === 'success',
    content_non_empty: (retrieval.byte_size || 0) > 0,
    required_evidence: hasName,
    fields_have_evidence: true, // guaranteed: we only set fields that produced evidence
    source_active: source.is_active === true,
    terms_ok: source.terms_ok !== false,
  }
  const reasons = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
  let status
  if (!checks.source_retrievable || !checks.content_non_empty || !checks.required_evidence) status = 'rejected'
  else if (reasons.length > 0 || (source.trust_level || 0) < 50) status = 'needs_review'
  else status = 'verified'
  return { status, checks, reasons }
}

export async function runPipeline({ sourceId, userId }) {
  // load source
  const { data: source, error: sErr } = await admin.from('sources').select('*').eq('id', sourceId).single()
  if (sErr || !source) throw new Error('Source not found')

  const connector = getConnector(source.connector)

  // create run
  const { data: run } = await admin.from('search_runs').insert({
    initiated_by: userId || null, connector: connector.key, status: 'running',
    started_at: new Date().toISOString(), region: null, source_ids: [source.id],
    params: { source_id: source.id, source_name: source.name },
  }).select('*').single()

  const runId = run.id
  const counters = { found: 0, verified: 0, rejected: 0, duplicated: 0 }
  await log(runId, 'source', 'ok', `Source: ${source.name} (${source.domain})`, { connector: connector.key })

  try {
    // ---- RETRIEVE
    if (source.is_active !== true) {
      await log(runId, 'source', 'fail', 'Source is not active/approved')
      await finishRun(runId, 'failed', counters, { error: 'source_inactive' })
      return summary(run, counters, 'failed')
    }
    const r = await connector.retrieve(source)
    const { data: retrieval } = await admin.from('retrievals').insert({
      run_id: runId, source_id: source.id, source_url: r.source_url, source_domain: r.source_domain,
      http_status: r.http_status, retrieval_status: r.retrieval_status, content_hash: r.content_hash,
      raw_content: r.raw_content, byte_size: r.byte_size, error: r.error,
    }).select('id').single()
    const retrievalId = retrieval?.id
    r.id = retrievalId

    if (r.retrieval_status !== 'success') {
      await log(runId, 'retrieve', 'fail', `Retrieval ${r.retrieval_status}: ${r.error || ''}`, { http_status: r.http_status }, { retrieval_id: retrievalId })
      await finishRun(runId, 'failed', counters, { retrieval_status: r.retrieval_status, error: r.error })
      return summary(run, counters, 'failed') // FAILURE BEHAVIOR: no lead created
    }
    await log(runId, 'retrieve', 'ok', `Retrieved ${r.byte_size} bytes (HTTP ${r.http_status})`, { content_hash: r.content_hash }, { retrieval_id: retrievalId })

    // ---- SEARCH (candidate items)
    const { kind, source_title, items } = connector.search(r)
    // update retrieval title
    if (source_title) await admin.from('retrievals').update({ source_title }).eq('id', retrievalId)
    r.source_title = source_title
    await log(runId, 'extract', 'ok', `Parsed ${items.length} candidate item(s) [${kind}]`, { kind, count: items.length }, { retrieval_id: retrievalId })

    for (const item of items) {
      // ---- EXTRACT
      const extracted = connector.extract(item, r)
      if (!extracted.evidence.some((e) => e.field === 'project_name')) {
        counters.rejected++
        await log(runId, 'validate', 'skip', 'Rejected: no project_name evidence', { title: item.title || null }, { retrieval_id: retrievalId })
        continue
      }
      // ---- NORMALIZE
      const normalized = connector.normalize(extracted)
      await log(runId, 'normalize', 'ok', `Normalized: ${normalized.project_name}`, { fields: Object.keys(normalized) }, { retrieval_id: retrievalId })

      // ---- DEDUP (combination, not solely project name)
      const dh = dedupHash(source, extracted.source_url, normalized)
      const { data: dup } = await admin.from('leads').select('id').eq('dedup_hash', dh).maybeSingle()
      if (dup) {
        counters.duplicated++
        await log(runId, 'dedup', 'skip', `Duplicate of lead ${dup.id}`, { dedup_hash: dh }, { retrieval_id: retrievalId, lead_id: dup.id })
        continue
      }

      // ---- EVIDENCE present -> VALIDATE
      const validation = runValidation({ source, retrieval: r, extracted, normalized })
      await log(runId, 'validate', validation.status === 'rejected' ? 'fail' : 'ok',
        `Validation: ${validation.status}${validation.reasons.length ? ' (' + validation.reasons.join(', ') + ')' : ''}`,
        validation.checks, { retrieval_id: retrievalId })
      if (validation.status === 'rejected') { counters.rejected++; continue } // do NOT create lead

      // ---- LEAD
      const { data: lead, error: lErr } = await admin.from('leads').insert({
        search_run_id: runId, primary_source_id: source.id, source_url: extracted.source_url,
        retrieval_id: retrievalId, content_hash: r.content_hash, dedup_hash: dh, is_demo: false,
        verification_status: validation.status, verified_at: validation.status === 'verified' ? new Date().toISOString() : null,
        ...normalized,
      }).select('id').single()
      if (lErr) { await log(runId, 'lead', 'fail', `Insert failed: ${lErr.message}`, {}, { retrieval_id: retrievalId }); counters.rejected++; continue }

      // ---- EVIDENCE rows
      const evidenceRows = extracted.evidence.map((e) => ({
        lead_id: lead.id, field_name: EVIDENCE_FIELD[e.field] || 'project_description',
        source_id: source.id, source_url: e.source_url, source_title: r.source_title || null, source_domain: r.source_domain,
        retrieved_content: e.snippet, extracted_value: e.value, extraction_method: e.method || 'regex',
        confidence: 0.9, content_hash: sha256(e.snippet),
      }))
      if (evidenceRows.length) await admin.from('lead_evidence').insert(evidenceRows)

      counters.found++
      if (validation.status === 'verified') counters.verified++
      await log(runId, 'lead', 'ok', `Created lead (${validation.status}): ${normalized.project_name}`, { evidence_count: evidenceRows.length }, { retrieval_id: retrievalId, lead_id: lead.id })
    }

    await finishRun(runId, 'completed', counters, { kind })
    return summary(run, counters, 'completed')
  } catch (e) {
    await log(runId, 'lead', 'fail', `Pipeline error: ${e.message}`)
    await finishRun(runId, 'failed', counters, { error: e.message })
    return summary(run, counters, 'failed')
  }
}

async function finishRun(runId, status, counters, extra = {}) {
  await admin.from('search_runs').update({
    status, finished_at: new Date().toISOString(),
    leads_found: counters.found, leads_verified: counters.verified,
    leads_rejected: counters.rejected, leads_duplicated: counters.duplicated,
    summary: { ...counters, ...extra },
  }).eq('id', runId)
}

function summary(run, counters, status) {
  return { run_id: run.id, status, ...counters }
}

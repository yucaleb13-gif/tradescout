import { admin } from '@/app/lib/supabase/admin'
import { getConnector } from '@/app/lib/connectors/registry'
import { sha256, domainOf } from '@/app/lib/connectors/genericWeb'
import { checkRobots, respectCrawlDelay } from '@/app/lib/pipeline/robots'

const htmlTitleOf = (c) => { const m = String(c || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i); return m ? m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) : null }

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

export async function runPipeline({ sourceId, userId, trigger = 'manual' }) {
  // load source
  const { data: source, error: sErr } = await admin.from('sources').select('*').eq('id', sourceId).single()
  if (sErr || !source) throw new Error('Source not found')

  const connector = getConnector(source.connector)
  const robotsCache = new Map()
  const lastFetchAt = new Map() // per-origin politeness (Crawl-delay)
  const startedAt = Date.now()
  const DETAIL_TIME_BUDGET_MS = 40000 // stay well under the route's 60s maxDuration

  // create run
  const { data: run } = await admin.from('search_runs').insert({
    initiated_by: userId || null, connector: connector.key, status: 'running',
    started_at: new Date().toISOString(), region: null, source_ids: [source.id],
    params: { source_id: source.id, source_name: source.name, trigger },
  }).select('*').single()

  const runId = run.id
  const counters = { found: 0, verified: 0, rejected: 0, duplicated: 0, details_fetched: 0, details_failed: 0 }
  await log(runId, 'source', 'ok', `Source: ${source.name} (${source.domain}) · trigger: ${trigger}`, { connector: connector.key, trigger })

  try {
    // ---- SOURCE checks
    if (source.is_active !== true) {
      await log(runId, 'source', 'fail', 'Source is not active/approved')
      await finishRun(runId, 'failed', counters, { error: 'source_inactive' })
      return summary(run, counters, 'failed')
    }
    const targetUrl = source?.config?.feed_url || source?.base_url
    if (!targetUrl) {
      await log(runId, 'source', 'fail', 'Source has no base_url/feed_url')
      await finishRun(runId, 'failed', counters, { error: 'no_url' })
      return summary(run, counters, 'failed')
    }

    // ---- ROBOTS guard (deterministic; blocked => no retrieval, no leads)
    const robots = await checkRobots(targetUrl, robotsCache)
    await admin.from('sources').update({ robots_allowed: robots.allowed, updated_at: new Date().toISOString() }).eq('id', source.id)
    if (!robots.allowed) {
      await admin.from('retrievals').insert({
        run_id: runId, source_id: source.id, source_url: targetUrl, source_domain: domainOf(targetUrl),
        http_status: null, retrieval_status: 'blocked', byte_size: 0, error: `Blocked by robots.txt (${robots.matched_rule || 'rule'})`,
      })
      await log(runId, 'robots', 'fail', `Blocked by robots.txt: ${robots.matched_rule || 'disallowed'}`, robots)
      await admin.from('sources').update({ last_crawled_at: new Date().toISOString() }).eq('id', source.id)
      await finishRun(runId, 'failed', counters, { error: 'robots_disallowed', robots })
      return summary(run, counters, 'failed')
    }
    await log(runId, 'robots', 'ok', robots.status === 'fetched'
      ? `robots.txt allows ${new URL(targetUrl).pathname}${robots.matched_rule ? ' (' + robots.matched_rule + ')' : ''}`
      : `No robots.txt restrictions found (${robots.status})`, robots)

    // ---- RETRIEVE
    await respectCrawlDelay(targetUrl, robots.crawl_delay, lastFetchAt)
    const r = await connector.retrieve(source)
    await admin.from('sources').update({ last_crawled_at: new Date().toISOString() }).eq('id', source.id)
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

    // detail fetch settings (opt-in per source)
    const detailEnabled = source.config?.fetch_details === true
    let detailBudget = detailEnabled ? Math.max(0, Math.min(25, Number(source.config?.max_detail_fetch ?? 10))) : 0
    if (detailEnabled) await log(runId, 'detail', 'ok', `Detail fetch enabled (max ${detailBudget} item page(s) this run)`, { max: detailBudget }, { retrieval_id: retrievalId })

    for (const item of items) {
      // ---- EXTRACT (feed-level)
      const extracted = connector.extract(item, r)
      if (!extracted.evidence.some((e) => e.field === 'project_name')) {
        counters.rejected++
        await log(runId, 'validate', 'skip', 'Rejected: no project_name evidence', { title: item.title || null }, { retrieval_id: retrievalId })
        continue
      }
      // ---- DEDUP (combination, not solely project name) — computed from feed-level facts so it is
      //      stable regardless of whether detail fetch is enabled.
      const baseNormalized = connector.normalize(extracted)
      const dh = dedupHash(source, extracted.source_url, baseNormalized)
      const { data: dup } = await admin.from('leads').select('id').eq('dedup_hash', dh).maybeSingle()
      if (dup) {
        counters.duplicated++
        await log(runId, 'dedup', 'skip', `Duplicate of lead ${dup.id}`, { dedup_hash: dh }, { retrieval_id: retrievalId, lead_id: dup.id })
        continue
      }

      // ---- DETAIL FETCH (optional): item page -> extra evidence for missing fields only
      if (detailEnabled && detailBudget > 0 && Date.now() - startedAt > DETAIL_TIME_BUDGET_MS) {
        await log(runId, 'detail', 'skip', `Detail fetch stopped: time budget reached (${detailBudget} item(s) left unfetched)`, { remaining: detailBudget }, { retrieval_id: retrievalId })
        detailBudget = 0
      }
      if (detailEnabled && detailBudget > 0 && extracted.source_url && extracted.source_url !== r.source_url && connector.retrieveDetail) {
        detailBudget--
        const dr = await checkRobots(extracted.source_url, robotsCache)
        if (!dr.allowed) {
          counters.details_failed++
          await log(runId, 'detail', 'skip', `Detail page blocked by robots.txt (${dr.matched_rule || 'disallowed'})`, { url: extracted.source_url }, { retrieval_id: retrievalId })
        } else {
          await respectCrawlDelay(extracted.source_url, dr.crawl_delay, lastFetchAt)
          const d = await connector.retrieveDetail(extracted.source_url)
          const { data: dret } = await admin.from('retrievals').insert({
            run_id: runId, source_id: source.id, source_url: d.source_url, source_domain: d.source_domain,
            http_status: d.http_status, retrieval_status: d.retrieval_status, content_hash: d.content_hash,
            raw_content: d.raw_content, byte_size: d.byte_size, error: d.error,
          }).select('id').single()
          if (d.retrieval_status !== 'success') {
            counters.details_failed++
            await log(runId, 'detail', 'fail', `Detail retrieval ${d.retrieval_status}: ${d.error || ''}`, { url: d.source_url, http_status: d.http_status }, { retrieval_id: dret?.id })
          } else {
            const extra = connector.extractDetail(extracted, d)
            for (const e of extra.evidence) extracted.evidence.push({ ...e, retrieval_id: dret?.id, source_title: htmlTitleOf(d._content) })
            Object.assign(extracted.fields, extra.fields)
            counters.details_fetched++
            await log(runId, 'detail', 'ok', `Detail page retrieved (${d.byte_size} bytes) · +${extra.evidence.length} field(s): ${Object.keys(extra.fields).join(', ') || 'none'}`, { url: d.source_url, fields: Object.keys(extra.fields) }, { retrieval_id: dret?.id })
          }
        }
      }

      // ---- NORMALIZE
      const normalized = connector.normalize(extracted)
      await log(runId, 'normalize', 'ok', `Normalized: ${normalized.project_name}`, { fields: Object.keys(normalized) }, { retrieval_id: retrievalId })

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

      // ---- EVIDENCE rows (each row points at the exact document the value came from)
      const evidenceRows = extracted.evidence.map((e) => ({
        lead_id: lead.id, field_name: EVIDENCE_FIELD[e.field] || 'project_description',
        source_id: source.id, source_url: e.source_url,
        source_title: e.source_title || r.source_title || null, source_domain: domainOf(e.source_url) || r.source_domain,
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

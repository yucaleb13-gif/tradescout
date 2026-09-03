// Phase 4: source-grounded AI processing.
// The AI is NOT a source of information. It only receives what the pipeline already retrieved
// (extracted fields + evidence snippets + source URL) and returns structured JSON that is validated
// before anything is saved. AI output lives ONLY in leads.ai_* columns; factual columns are never touched.
import { LlmChat, UserMessage } from 'emergentintegrations'
import crypto from 'crypto'
import { admin } from '@/app/lib/supabase/admin'

export const AI_SCHEMA_VERSION = 'tradescout.ai.v1'
const PROVIDER = 'openai'
const MODEL = process.env.EMERGENT_MODEL || 'gpt-4o-mini'
const TRADES = ['windows_doors', 'siding', 'roofing', 'renovations', 'building_envelope', 'hvac', 'electrical', 'plumbing', 'concrete', 'landscaping', 'other']
const PROJECT_TYPES = ['Residential', 'Commercial', 'Industrial', 'Institutional', 'Infrastructure', 'Mixed-Use', 'Goods/Services (non-construction)', 'Other']

const FACT_FIELDS = ['project_name', 'project_type', 'trade_category', 'location', 'address', 'company_name', 'contact_name', 'contact_email', 'contact_phone',
  'project_description', 'timeline_text', 'timeline_start', 'timeline_end', 'bid_deadline', 'tender_status', 'source_stated_value', 'source_stated_value_currency']

const SYSTEM_PROMPT = `You are TradeScout's source-grounded analyst for trade contractors (windows & doors, siding, roofing, envelope, HVAC, electrical, plumbing, concrete, landscaping).

ABSOLUTE RULES
1. You are NOT a source of information. Use ONLY the RETRIEVED SOURCE MATERIAL provided in the user message (extracted fields + evidence snippets). Ignore any prior knowledge about organizations, places or projects.
2. Every sentence of the summary must be supported by that material. Never estimate values, quantities, dates, scope, contacts or bid status that the source does not state. If something relevant is not stated, say so explicitly, e.g. "The source does not state a contract value."
3. Do not invent or complete missing fields. Do not copy contact details into the summary.
4. Classification must be justified by quoting the evidence ids that support it. If the material does not support a classification, return null and explain.
5. Output strictly the JSON object described below. No markdown, no prose outside JSON.

OUTPUT JSON SHAPE
{
  "summary": string (2-4 sentences, <= 700 chars, plain language, every statement grounded; include at least one explicit "The source does not state ..." sentence when key facts are missing),
  "trade_classification": { "trade": one of ${JSON.stringify(TRADES)} or null, "rationale": string, "evidence_ids": [string] },
  "project_type_classification": { "project_type": one of ${JSON.stringify(PROJECT_TYPES)} or null, "rationale": string, "evidence_ids": [string] },
  "relevance": { "explanation": string (why this is or is not a fit for the requested trade; grounded), "fit": "strong" | "possible" | "weak" | "not_applicable", "evidence_ids": [string] },
  "evidence_groups": [ { "group": "Scope" | "Location" | "Timeline" | "Buyer & contact" | "Commercial" | "Other", "evidence_ids": [string] } ],
  "unknowns": [string]  (facts a contractor would want that the source does NOT state)
}`

const trunc = (s, n) => (s == null ? '' : String(s)).slice(0, n)

export function buildAiInput(lead, evidence) {
  const fields = {}
  for (const k of FACT_FIELDS) if (lead[k] !== null && lead[k] !== undefined && lead[k] !== '') fields[k] = lead[k]
  const ev = (evidence || []).map((e, i) => ({
    id: `E${i + 1}`, evidence_id: e.id, field: e.field_name, value: trunc(e.extracted_value, 300),
    snippet: trunc(e.retrieved_content, 700), source_url: e.source_url, method: e.extraction_method,
  }))
  return {
    lead_id: lead.id, source_url: lead.source_url, source_name: lead.source?.name || null,
    verification_status: lead.verification_status, requested_trade: lead.trade_category || null,
    fields, evidence: ev,
  }
}

function userPrompt(input) {
  return `RETRIEVED SOURCE MATERIAL (the only information you may use)
Source URL: ${input.source_url}
Source: ${input.source_name || 'n/a'}
Verification status of the lead: ${input.verification_status}
Requested trade (user filter): ${input.requested_trade || 'none'}

EXTRACTED FIELDS (each one is backed by evidence below):
${JSON.stringify(input.fields, null, 2)}

EVIDENCE (cite by id):
${input.evidence.map((e) => `[${e.id}] field=${e.field} value="${e.value}"\n    snippet: "${e.snippet}"`).join('\n')}

Return the JSON object now.`
}

// ---------------------------------------------------------------- validation (deterministic)
const NUM_RE = /\$?\s?\d[\d,]*(?:\.\d+)?\s?(?:%|million|billion|bn|m|k)?/gi
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const normNum = (s) => s.toLowerCase().replace(/[\s,$]/g, '').replace(/million/g, 'm').replace(/billion|bn/g, 'b').replace(/thousand/g, 'k')

export function validateAiOutput(raw, input) {
  const problems = []
  let out
  try { out = typeof raw === 'string' ? JSON.parse(stripFences(raw)) : raw } catch { return { ok: false, problems: ['response_not_json'] } }
  if (!out || typeof out !== 'object') return { ok: false, problems: ['response_not_object'] }

  const ids = new Set(input.evidence.map((e) => e.id))
  const cleanIds = (arr, where) => {
    if (!Array.isArray(arr)) { problems.push(`${where}.evidence_ids_not_array`); return [] }
    const bad = arr.filter((x) => !ids.has(x))
    if (bad.length) problems.push(`${where}.unknown_evidence_ids:${bad.join(',')}`)
    return arr.filter((x) => ids.has(x))
  }

  // summary
  if (typeof out.summary !== 'string' || out.summary.trim().length < 20) problems.push('summary_missing')
  const summary = trunc(out.summary, 1200).trim()
  // grounding: every number / money token and every email in the summary must appear in the source material
  const corpus = normNum(JSON.stringify(input.fields) + ' ' + input.evidence.map((e) => e.value + ' ' + e.snippet).join(' '))
  const nums = (summary.match(NUM_RE) || []).map(normNum).filter((n) => /\d/.test(n))
  const unsupportedNums = nums.filter((n) => !corpus.includes(n))
  if (unsupportedNums.length) problems.push(`summary_unsupported_numbers:${unsupportedNums.slice(0, 5).join('|')}`)
  const emails = summary.match(EMAIL_RE) || []
  if (emails.length) problems.push('summary_contains_contact_details')
  if (/\b(likely|probably|estimated at|approximately|we estimate|should cost|will require \$)/i.test(summary)) problems.push('summary_speculative_language')

  // classifications
  const tc = out.trade_classification || {}
  const trade = TRADES.includes(tc.trade) ? tc.trade : null
  if (tc.trade != null && !TRADES.includes(tc.trade)) problems.push('trade_not_in_enum')
  const tradeIds = cleanIds(tc.evidence_ids, 'trade')
  if (trade && tradeIds.length === 0) problems.push('trade_without_evidence') // confident but no evidence => invalid

  const pc = out.project_type_classification || {}
  const ptype = PROJECT_TYPES.includes(pc.project_type) ? pc.project_type : null
  if (pc.project_type != null && !PROJECT_TYPES.includes(pc.project_type)) problems.push('project_type_not_in_enum')
  const ptypeIds = cleanIds(pc.evidence_ids, 'project_type')
  if (ptype && ptypeIds.length === 0) problems.push('project_type_without_evidence')

  const rel = out.relevance || {}
  const fit = ['strong', 'possible', 'weak', 'not_applicable'].includes(rel.fit) ? rel.fit : null
  if (!fit) problems.push('relevance_fit_invalid')
  const relIds = cleanIds(rel.evidence_ids, 'relevance')

  const groups = Array.isArray(out.evidence_groups) ? out.evidence_groups
    .filter((g) => g && typeof g.group === 'string')
    .map((g) => ({ group: trunc(g.group, 40), evidence_ids: cleanIds(g.evidence_ids, 'groups') }))
    .filter((g) => g.evidence_ids.length) : []
  const unknowns = Array.isArray(out.unknowns) ? out.unknowns.filter((u) => typeof u === 'string').map((u) => trunc(u, 200)).slice(0, 10) : []

  const hard = problems.filter((p) => /^(response_|summary_missing|summary_unsupported_numbers|summary_contains_contact|summary_speculative|trade_without_evidence|project_type_without_evidence|relevance_fit_invalid)/.test(p))
  if (hard.length) return { ok: false, problems }

  const evidenceIdMap = Object.fromEntries(input.evidence.map((e) => [e.id, e.evidence_id]))
  const mapIds = (arr) => arr.map((x) => evidenceIdMap[x]).filter(Boolean)
  return {
    ok: true, problems,
    value: {
      summary,
      trade_classification: { trade, rationale: trunc(tc.rationale, 500), evidence_ids: mapIds(tradeIds) },
      project_type_classification: { project_type: ptype, rationale: trunc(pc.rationale, 500), evidence_ids: mapIds(ptypeIds) },
      relevance: { fit, explanation: trunc(rel.explanation, 700), evidence_ids: mapIds(relIds) },
      evidence_groups: groups.map((g) => ({ group: g.group, evidence_ids: mapIds(g.evidence_ids) })),
      unknowns,
    },
  }
}

function stripFences(s) {
  let t = String(s).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { JSON.parse(t); return t } catch { /* fall through */ }
  const a = t.indexOf('{'); const b = t.lastIndexOf('}')
  if (a >= 0 && b > a) t = t.slice(a, b + 1)
  // mechanical repair only: quote bare evidence ids inside arrays ([E10, E8] -> ["E10", "E8"]); never touches content
  t = t.replace(/([\[,]\s*)(E\d+)(?=\s*[,\]])/g, '$1"$2"')
  return t
}

// ---------------------------------------------------------------- run + persist
async function logAi(lead, status, message, meta = {}) {
  if (!lead.search_run_id) return
  await admin.from('pipeline_logs').insert({ run_id: lead.search_run_id, lead_id: lead.id, step: 'ai', status, message: trunc(message, 2000), meta })
}

export async function processLeadAi(leadId, { force = false, trigger = 'manual' } = {}) {
  const { data: lead, error } = await admin.from('leads').select('*, source:sources(name, domain)').eq('id', leadId).single()
  if (error || !lead) throw new Error('Lead not found')
  if (lead.is_demo) return { lead_id: leadId, status: 'skipped', reason: 'demo_lead' }
  if (lead.verification_status === 'rejected') return { lead_id: leadId, status: 'skipped', reason: 'rejected_lead' }
  if (!force && lead.ai_generated_at) return { lead_id: leadId, status: 'skipped', reason: 'already_processed' }
  if (!process.env.EMERGENT_LLM_KEY) return await failAi(lead, 'EMERGENT_LLM_KEY not configured', trigger)

  const { data: evidence } = await admin.from('lead_evidence').select('*').eq('lead_id', leadId).order('created_at', { ascending: true })
  if (!evidence?.length) return await failAi(lead, 'No evidence on lead — AI processing refused (nothing to ground on)', trigger)

  const input = buildAiInput(lead, evidence)
  const inputHash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex')
  const started = Date.now()
  let raw, chat
  try {
    chat = new LlmChat(process.env.EMERGENT_LLM_KEY, `lead-${leadId}-${Date.now()}`, SYSTEM_PROMPT)
      .withModel(PROVIDER, MODEL).withParams({ temperature: 0, max_tokens: 1400 })
    raw = await callWithRetry(() => withTimeout(chat.sendMessage(new UserMessage({ text: userPrompt(input) })), 30000))
  } catch (e) {
    const transient = isTransient(e)
    return await failAi(lead, `LLM call failed: ${e.message}`, trigger, { input_hash: inputHash, transient })
  }

  let v = validateAiOutput(raw, input)
  if (!v.ok) {
    // one corrective turn in the same session: name the violations, demand JSON only. Output is validated again — never trusted.
    const why = v.problems.some((p) => p.startsWith('response_'))
      ? 'Your previous reply was not a valid JSON object.'
      : `Your previous JSON violated these rules: ${v.problems.join('; ')}. Remove any number, amount or claim that does not appear verbatim in the evidence; cite evidence ids (as quoted strings) for every classification; use null when the evidence does not support a classification.`
    try {
      raw = await callWithRetry(() => withTimeout(chat.sendMessage(new UserMessage({ text: `${why} Return ONLY the corrected JSON object, no prose or markdown.` })), 30000))
      v = validateAiOutput(raw, input)
    } catch (e) { return await failAi(lead, `LLM call failed on retry: ${e.message}`, trigger, { input_hash: inputHash, transient: isTransient(e) }) }
  }
  if (!v.ok) return await failAi(lead, `AI output rejected by validator: ${v.problems.join('; ')}`, trigger, { input_hash: inputHash, raw: trunc(raw, 4000) })

  const now = new Date().toISOString()
  const classification = {
    schema_version: AI_SCHEMA_VERSION, status: 'ok', provider: PROVIDER, model: MODEL, generated_at: now, trigger,
    latency_ms: Date.now() - started, input_hash: inputHash, validator_notes: v.problems,
    // auditability: the exact source-derived data the AI saw, plus evidence references
    input_snapshot: { fields: input.fields, evidence_ids: evidence.map((e) => e.id), source_url: input.source_url },
    ...v.value,
  }
  // Only ai_* columns are written. Factual columns are never modified by AI.
  await admin.from('leads').update({ ai_summary: v.value.summary, ai_classification: classification, ai_model: `${PROVIDER}/${MODEL} via emergentintegrations`, ai_generated_at: now, updated_at: now }).eq('id', leadId)
  await logAi(lead, 'ok', `AI summary generated (${MODEL}, ${classification.latency_ms} ms) · fit: ${v.value.relevance.fit}`, { model: MODEL, latency_ms: classification.latency_ms, validator_notes: v.problems })
  return { lead_id: leadId, status: 'ok', model: MODEL, latency_ms: classification.latency_ms, fit: v.value.relevance.fit }
}

async function failAi(lead, message, trigger, meta = {}) {
  // FAILURE BEHAVIOUR: keep verified source data untouched; record the failure; no replacement text.
  const now = new Date().toISOString()
  const prev = lead.ai_classification && lead.ai_classification.status === 'ok' ? lead.ai_classification : null
  const record = prev
    ? { ...prev, last_attempt: { status: 'failed', error: trunc(message, 500), at: now, trigger } } // keep the last good summary
    : { schema_version: AI_SCHEMA_VERSION, status: 'failed', transient: meta.transient === true, error: trunc(message, 500), attempted_at: now, trigger, provider: PROVIDER, model: MODEL, input_hash: meta.input_hash || null, raw: meta.raw || null }
  await admin.from('leads').update({ ai_classification: record, updated_at: now }).eq('id', lead.id)
  await logAi(lead, 'fail', message, { trigger })
  return { lead_id: lead.id, status: 'failed', error: message }
}

const isTransient = (e) => /429|concurrent_request_limit|rate limit|timeout|ECONNRESET|ETIMEDOUT|503|502/i.test(String(e?.message || e))
async function callWithRetry(fn, attempts = 3) {
  let last
  for (let i = 0; i < attempts; i++) {
    try { return await fn() } catch (e) { last = e; if (!isTransient(e)) throw e; await new Promise((r) => setTimeout(r, 1500 * (i + 1))) }
  }
  throw last
}

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout after ${ms} ms`)), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

// Process several leads with bounded concurrency and a total time budget (used after searches / by the scheduler).
export async function processLeadsAi(leadIds, { concurrency = 1, budgetMs = 25000, trigger = 'pipeline' } = {}) {
  const queue = [...leadIds]; const results = []; const started = Date.now()
  const worker = async () => {
    while (queue.length && Date.now() - started < budgetMs) {
      const id = queue.shift()
      try { results.push(await processLeadAi(id, { trigger })) } catch (e) { results.push({ lead_id: id, status: 'failed', error: e.message }) }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, worker))
  return { processed: results.length, pending: queue.length, results }
}

export async function listPendingAiLeads(limit = 10) {
  // never processed, or failed only transiently (rate limit / timeout). Validator rejections are retried only by explicit user action.
  const { data } = await admin.from('leads').select('id').eq('is_demo', false).neq('verification_status', 'rejected')
    .is('ai_generated_at', null).or('ai_classification.is.null,ai_classification->>transient.eq.true')
    .order('created_at', { ascending: false }).limit(limit)
  return (data || []).filter(Boolean).map((l) => l.id)
}

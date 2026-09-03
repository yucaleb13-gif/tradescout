/**
 * TradeScout deterministic opportunity scoring (0-100).
 *
 * PRINCIPLES
 * - Deterministic & explainable: the score is a pure function of already-verified,
 *   source-derived lead fields + the evidence attached to the lead.
 * - NEVER AI-assigned, NEVER inferred. A factor earns points only when it can be
 *   verified from stored data; otherwise it earns ZERO (no guessing, no partial credit).
 * - The model is data-driven (SCORING_MODEL below) so weights, thresholds and factors
 *   can be changed later WITHOUT touching the lead pipeline or the UI. Bump `version`
 *   whenever the model changes so stored breakdowns remain traceable.
 *
 * This file is CommonJS on purpose so it can be imported by the Next.js app AND by a
 * plain Node backfill/re-score script.
 */

const ACTIVE_TENDER_STATUSES = ['open', 'closing_soon']

// ------------------------------------------------------------------ the model
const SCORING_MODEL = {
  version: 'tradescout.score.v1',
  max: 100,
  recency_days: 30,        // "recently published" window
  reliable_trust_min: 70,  // source trust_level considered "reliable"

  // Ordered high -> low. First category whose `min` is <= score wins.
  categories: [
    { key: 'high',     label: 'High Opportunity',     min: 80 },
    { key: 'good',     label: 'Good Opportunity',     min: 60 },
    { key: 'moderate', label: 'Moderate Opportunity', min: 40 },
    { key: 'low',      label: 'Low Opportunity',      min: 0 },
  ],

  // Each factor: award `points` only when `test(ctx)` returns awarded:true.
  factors: [
    {
      key: 'active_tender',
      label: 'Active tender / RFP',
      points: 25,
      test: (ctx) => {
        const s = String(ctx.lead.tender_status || '').toLowerCase()
        const awarded = ACTIVE_TENDER_STATUSES.includes(s)
        return {
          awarded,
          reason: awarded
            ? `Tender status is "${s}" — an active, open solicitation`
            : `Tender status is "${s || 'unknown'}" — not a verifiably active solicitation`,
        }
      },
    },
    {
      key: 'trade_match',
      label: 'Strong trade match',
      points: 20,
      test: (ctx) => {
        const hasTrade = !!ctx.lead.trade_category
        // require the trade to be evidence-backed when evidence is available
        const evOk = ctx.evidenceFields ? ctx.evidenceFields.has('trade_category') : true
        const awarded = hasTrade && evOk
        return {
          awarded,
          reason: awarded
            ? `Trade classified as "${ctx.lead.trade_category}" from source evidence`
            : (!hasTrade ? 'No trade could be matched from the source text' : 'Trade not backed by evidence'),
        }
      },
    },
    {
      key: 'contact_info',
      label: 'Public contact information available',
      points: 15,
      test: (ctx) => {
        const email = !!ctx.lead.contact_email
        const phone = !!ctx.lead.contact_phone
        const awarded = email || phone
        return {
          awarded,
          reason: awarded
            ? `Public ${[email && 'email', phone && 'phone'].filter(Boolean).join(' & ')} available`
            : 'No public contact email or phone stated by the source',
        }
      },
    },
    {
      key: 'recently_published',
      label: 'Recently published',
      points: 15,
      test: (ctx) => {
        const raw = ctx.lead.published_at
        if (!raw) return { awarded: false, reason: 'No verifiable publication date' }
        const d = new Date(raw)
        if (isNaN(d.getTime())) return { awarded: false, reason: 'No verifiable publication date' }
        const day = String(raw).slice(0, 10)
        const ageMs = ctx.now.getTime() - d.getTime()
        if (ageMs < 0) return { awarded: false, reason: `Publication date ${day} is in the future` }
        const withinMs = ctx.model.recency_days * 24 * 3600 * 1000
        const awarded = ageMs <= withinMs
        return {
          awarded,
          reason: awarded
            ? `Published ${day} (within the last ${ctx.model.recency_days} days)`
            : `Published ${day} (older than ${ctx.model.recency_days} days)`,
        }
      },
    },
    {
      key: 'project_size',
      label: 'Project size information available',
      points: 10,
      test: (ctx) => {
        const v = ctx.lead.source_stated_value
        const awarded = v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v))
        return {
          awarded,
          reason: awarded
            ? 'Source states a project value'
            : 'Source does not state a project value',
        }
      },
    },
    {
      key: 'timeline',
      label: 'Timeline / deadline available',
      points: 10,
      test: (ctx) => {
        const l = ctx.lead
        const awarded = !!(l.bid_deadline || l.timeline_end || l.timeline_start || l.timeline_text)
        return {
          awarded,
          reason: awarded
            ? 'A closing date / timeline is stated by the source'
            : 'No timeline or deadline stated by the source',
        }
      },
    },
    {
      key: 'reliable_source',
      label: 'Reliable source',
      points: 5,
      test: (ctx) => {
        const t = ctx.trustLevel
        const awarded = t !== null && t !== undefined && Number(t) >= ctx.model.reliable_trust_min
        return {
          awarded,
          reason: awarded
            ? `Source trust level ${t} \u2265 ${ctx.model.reliable_trust_min}`
            : `Source trust level ${t ?? 'unknown'} below ${ctx.model.reliable_trust_min}`,
        }
      },
    },
  ],
}

function categoryOf(score, model = SCORING_MODEL) {
  return model.categories.find((c) => score >= c.min) || model.categories[model.categories.length - 1]
}

/**
 * Compute a deterministic score for a lead.
 * @param {object} lead  - lead row (source-derived factual fields).
 * @param {object} opts
 * @param {Array}  opts.evidence    - lead_evidence rows (uses .field_name or .field).
 * @param {number} opts.trustLevel  - primary source trust_level (0-100).
 * @param {Date}   opts.now         - reference time (defaults to new Date()).
 * @param {object} opts.model       - scoring model (defaults to SCORING_MODEL).
 * @returns {{model_version, score, raw, max, category, category_label, factors, scored_at}}
 */
function scoreLead(lead = {}, opts = {}) {
  const model = opts.model || SCORING_MODEL
  const now = opts.now instanceof Date ? opts.now : new Date()
  const evidenceFields = opts.evidence
    ? new Set(opts.evidence.map((e) => e.field_name || e.field).filter(Boolean))
    : null
  const trustLevel = opts.trustLevel != null
    ? opts.trustLevel
    : (lead.source?.trust_level ?? lead.trust_level ?? null)

  const ctx = { lead, evidenceFields, trustLevel, now, model }
  const maxPossible = model.factors.reduce((a, f) => a + f.points, 0)

  const factors = model.factors.map((f) => {
    const r = f.test(ctx)
    return {
      key: f.key,
      label: f.label,
      points: f.points,
      awarded: !!r.awarded,
      earned: r.awarded ? f.points : 0,
      reason: r.reason,
    }
  })

  const raw = factors.reduce((a, f) => a + f.earned, 0)
  const score = maxPossible > 0 ? Math.round((raw / maxPossible) * model.max) : 0
  const cat = categoryOf(score, model)

  return {
    model_version: model.version,
    score,
    raw,
    max: model.max,
    category: cat.key,
    category_label: cat.label,
    factors,
    scored_at: now.toISOString(),
  }
}

/** DB column payload for persisting a score result on a lead row. */
function scoreColumns(result) {
  return {
    lead_score: result.score,
    score_category: result.category,
    scored_at: result.scored_at,
    score_factors: {
      model_version: result.model_version,
      score: result.score,
      raw: result.raw,
      max: result.max,
      category: result.category,
      category_label: result.category_label,
      factors: result.factors,
    },
  }
}

module.exports = { SCORING_MODEL, scoreLead, scoreColumns, categoryOf }

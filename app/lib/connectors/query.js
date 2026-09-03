// Deterministic search filters shared by all connectors. Pure text matching on source-stated fields.
// No inference: an item matches only if the source's own text contains the requested terms.

export const TRADE_KEYWORDS = {
  windows_doors: ['window', 'door', 'glazing', 'fenestration', 'curtain wall', 'storefront'],
  siding: ['siding', 'cladding'],
  roofing: ['roof', 'roofing', 'shingle', 'membrane'],
  renovations: ['renovation', 'remodel', 'refurbish', 'retrofit'],
  building_envelope: ['envelope', 'waterproofing', 'insulation', 'facade', 'façade'],
  hvac: ['hvac', 'heating', 'ventilation', 'air conditioning', 'mechanical'],
  electrical: ['electrical', 'wiring', 'lighting', 'switchgear', 'power distribution'],
  plumbing: ['plumbing', 'piping', 'water main', 'sewer', 'drainage'],
  concrete: ['concrete', 'paving', 'foundation', 'masonry', 'sidewalk'],
  landscaping: ['landscap', 'irrigation', 'grading', 'planting', 'streetscape'],
}

// Human-curated geography aliases (factual municipality lists), used ONLY to widen a location filter.
// Fraser Valley = municipalities/communities of the Fraser Valley Regional District, BC.
export const DEFAULT_LOCATION_ALIASES = {
  'fraser valley': ['fraser valley', 'abbotsford', 'chilliwack', 'mission', 'hope', 'kent', 'agassiz', 'harrison hot springs', 'harrison mills', 'yarrow', 'cultus lake', 'boston bar', 'fvrd'],
  'british columbia': ['british columbia', 'b.c.', 'bc'],
  'bc': ['british columbia', 'b.c.', 'bc'],
  'b.c.': ['british columbia', 'b.c.', 'bc'],
  'metro vancouver': ['metro vancouver', 'vancouver', 'burnaby', 'surrey', 'richmond', 'coquitlam', 'langley', 'delta', 'new westminster', 'north vancouver', 'west vancouver', 'maple ridge', 'pitt meadows', 'port moody', 'port coquitlam', 'white rock'],
}

const norm = (s) => ` ${String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()} `
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Keyword must start at a word boundary so "door" never matches "indoor"; suffixes are allowed ("doors", "roofing").
const kwRe = (k) => new RegExp(`(^|[^a-z0-9])${escapeRe(k)}`, 'i')
export function keywordHit(text, keywords) {
  const t = String(text || '')
  return keywords.find((k) => kwRe(k).test(t)) || null
}

export function tradeMatch(text, trade) {
  if (!trade) return { ok: true, hit: null }
  const kws = TRADE_KEYWORDS[trade]
  if (!kws) return { ok: false, hit: null }
  const hit = keywordHit(text, kws)
  return { ok: !!hit, hit }
}

// First trade whose keyword appears in the text (deterministic order of TRADE_KEYWORDS).
export function detectTradeIn(text) {
  for (const [trade, kws] of Object.entries(TRADE_KEYWORDS)) {
    const hit = keywordHit(text, kws)
    if (hit) return { trade, hit }
  }
  return null
}

// Location fields (region/city/province columns): case-insensitive, whole-word.
const fieldTermRe = (term) => new RegExp(`(^|[^a-z0-9])${escapeRe(term.toLowerCase())}($|[^a-z0-9])`, 'i')
// Free text (titles/descriptions): only as a capitalised proper noun ("Mission, BC", "Chilliwack"), so common
// words like "mission" or "hope" in prose never count as a place.
const titleCase = (term) => term.split(' ').map((w) => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ')
const textTermRe = (term) => {
  const forms = [titleCase(term), term.toUpperCase()]
  return new RegExp(`(^|[^A-Za-z0-9])(?:${forms.map(escapeRe).join('|')})($|[^A-Za-z0-9])`)
}

// Query "Fraser Valley, British Columbia" -> every comma-part must match (AND), each part widened by aliases (OR).
// `subject` may be a string (treated as free text) or { fields, text }.
export function locationMatch(queryLocation, subject, aliases = DEFAULT_LOCATION_ALIASES) {
  if (!queryLocation || !String(queryLocation).trim()) return { ok: true, hits: [] }
  const fields = typeof subject === 'string' ? '' : String(subject?.fields || '')
  const text = typeof subject === 'string' ? subject : String(subject?.text || '')
  const parts = String(queryLocation).split(',').map((p) => p.trim().toLowerCase()).filter(Boolean)
  const hits = []
  for (const part of parts) {
    const terms = [part, ...(aliases[part] || [])]
    const hit = terms.find((term) => (fields && fieldTermRe(term).test(fields)) || (text && textTermRe(term).test(text)))
    if (!hit) return { ok: false, hits }
    hits.push(hit)
  }
  return { ok: true, hits }
}

export function textMatch(query, text) {
  if (!query || !String(query).trim()) return true
  return norm(text).includes(String(query).toLowerCase().trim())
}

export function dateInRange(dateStr, from, to) {
  if (!from && !to) return true
  if (!dateStr) return false // unknown date cannot satisfy a date filter
  const d = new Date(dateStr); if (isNaN(d.getTime())) return false
  if (from && d < new Date(from)) return false
  if (to) { const end = new Date(to); end.setHours(23, 59, 59, 999); if (d > end) return false }
  return true
}

export function normalizeQuery(q = {}) {
  const limit = Math.max(1, Math.min(20, Number(q.limit) || 20))
  return {
    trade: q.trade || null,
    location: q.location ? String(q.location).trim() : null,
    project_type: q.project_type || null,
    date_from: q.date_from || null,
    date_to: q.date_to || null,
    limit,
  }
}

export function describeQuery(q) {
  const parts = []
  if (q.trade) parts.push(`trade=${q.trade}`)
  if (q.location) parts.push(`location="${q.location}"`)
  if (q.project_type) parts.push(`project_type=${q.project_type}`)
  if (q.date_from || q.date_to) parts.push(`published ${q.date_from || '…'}→${q.date_to || '…'}`)
  parts.push(`limit=${q.limit}`)
  return parts.join(', ')
}

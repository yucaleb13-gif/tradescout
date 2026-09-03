export const TRADES = [
  { value: 'windows_doors', label: 'Windows & Doors' },
  { value: 'siding', label: 'Siding' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'renovations', label: 'Renovations' },
  { value: 'building_envelope', label: 'Building Envelope' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'concrete', label: 'Concrete' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'other', label: 'Other' },
]

export const tradeLabel = (v) => TRADES.find((t) => t.value === v)?.label || (v ? 'Other' : null)

export const PROJECT_TYPES = [
  'Residential', 'Commercial', 'Industrial', 'Institutional', 'Infrastructure', 'Mixed-Use', 'Other',
]

export const LEAD_STATUSES = ['New', 'Interested', 'Contacted', 'Quoting', 'Won', 'Lost']

export const STATUS_STYLES = {
  New: 'bg-blue-100 text-blue-700 border-blue-200',
  Interested: 'bg-amber-100 text-amber-700 border-amber-200',
  Contacted: 'bg-violet-100 text-violet-700 border-violet-200',
  Quoting: 'bg-orange-100 text-orange-700 border-orange-200',
  Won: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Lost: 'bg-rose-100 text-rose-700 border-rose-200',
}

export const VERIFICATION_STYLES = {
  verified: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  needs_review: 'bg-amber-100 text-amber-700 border-amber-200',
  pending: 'bg-blue-100 text-blue-700 border-blue-200',
  unverified: 'bg-slate-100 text-slate-600 border-slate-200',
  rejected: 'bg-rose-100 text-rose-700 border-rose-200',
}

export const RADIUS_OPTIONS = [10, 25, 50, 100, 250]

export const money = (v, ccy = 'USD') => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (Number.isNaN(n)) return null
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy || 'USD', maximumFractionDigits: 0 }).format(n)
}

// Consistent placeholder for unavailable data (never fabricate).
export const UNAVAILABLE = 'Not available'

// Deterministic opportunity score categories (mirror app/lib/scoring/score.js).
export const SCORE_CATEGORY_STYLES = {
  high:     'bg-emerald-100 text-emerald-700 border-emerald-200',
  good:     'bg-blue-100 text-blue-700 border-blue-200',
  moderate: 'bg-amber-100 text-amber-700 border-amber-200',
  low:      'bg-slate-100 text-slate-600 border-slate-200',
}
export const SCORE_CATEGORY_LABELS = {
  high: 'High Opportunity', good: 'Good Opportunity', moderate: 'Moderate Opportunity', low: 'Low Opportunity',
}
export const scoreCategoryOf = (score) => {
  if (score == null) return null
  if (score >= 80) return 'high'
  if (score >= 60) return 'good'
  if (score >= 40) return 'moderate'
  return 'low'
}

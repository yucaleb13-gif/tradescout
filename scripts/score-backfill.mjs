import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { scoreLead, scoreColumns } from '../app/lib/scoring/score.js'

const env = readFileSync('/app/.env', 'utf8')
const g = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]
const admin = createClient(g('NEXT_PUBLIC_SUPABASE_URL'), g('SUPABASE_SECRET_KEY'), { auth: { persistSession: false } })

const { data: leads, error } = await admin.from('leads').select('*, source:sources(trust_level)')
if (error) { console.error(error.message); process.exit(1) }

const ids = leads.map((l) => l.id)
const evByLead = {}
for (let i = 0; i < ids.length; i += 200) {
  const { data: ev } = await admin.from('lead_evidence').select('id, lead_id, field_name').in('lead_id', ids.slice(i, i + 200))
  for (const e of ev || []) (evByLead[e.lead_id] ||= []).push(e)
}

const dist = { high: 0, good: 0, moderate: 0, low: 0 }
let scored = 0
for (const l of leads) {
  // derive published_at from source-stated timeline text if not already set (source-derived, not fabricated)
  let publishedAt = l.published_at
  if (!publishedAt && l.timeline_text) {
    const m = String(l.timeline_text).match(/Published\s+(\d{4}-\d{2}-\d{2})/i)
    if (m) publishedAt = m[1]
  }
  const leadForScore = { ...l, published_at: publishedAt }
  const result = scoreLead(leadForScore, { evidence: evByLead[l.id] || [], trustLevel: l.source?.trust_level, now: new Date() })
  const update = { ...scoreColumns(result) }
  if (publishedAt && !l.published_at) update.published_at = publishedAt
  const { error: uErr } = await admin.from('leads').update(update).eq('id', l.id)
  if (uErr) { console.error('update failed', l.id, uErr.message); continue }
  scored++
  dist[result.category]++
}
console.log(`Scored ${scored}/${leads.length} leads`)
console.log('Distribution:', dist)

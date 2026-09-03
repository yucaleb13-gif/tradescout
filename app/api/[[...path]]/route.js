import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { admin } from '@/app/lib/supabase/admin'
import { runPipeline } from '@/app/lib/pipeline/engine'
import { listConnectors } from '@/app/lib/connectors/registry'
import { runDueSources, listDueSources, ensureScheduler } from '@/app/lib/pipeline/scheduler'
import { purgeSource, purgeRun } from '@/app/lib/pipeline/purge'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// In-process ticker for scheduled runs (long-lived server). External schedulers can call GET /api/cron/run-due.
ensureScheduler()

const json = (data, status = 200) => NextResponse.json(data, { status })

async function getUserId(supabase) {
  const { data } = await supabase.auth.getUser()
  return data?.user?.id || null
}

// ------------------------------------------------------------------ POST
export async function POST(request, context) {
  const path = (await context.params)?.path?.join('/') || ''
  const body = await request.json().catch(() => ({}))
  const supabase = await createClient()

  // -------- AUTH
  if (path === 'auth/signup') {
    const { email, password, fullName, companyName } = body
    if (!email || !password) return json({ error: 'Email and password are required' }, 400)
    // Create an already-confirmed user via admin so the account is usable immediately.
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || null, company_name: companyName || null },
    })
    if (cErr) {
      const msg = /already/i.test(cErr.message) ? 'An account with this email already exists' : cErr.message
      return json({ error: msg }, 400)
    }
    // Best-effort: ensure profile has the details (trigger also handles this).
    await admin.from('profiles').update({ full_name: fullName || null, company_name: companyName || null })
      .eq('id', created.user.id)
    // Sign in to establish the cookie session.
    const { error: sErr } = await supabase.auth.signInWithPassword({ email, password })
    if (sErr) return json({ error: sErr.message }, 400)
    return json({ ok: true, user: { id: created.user.id, email } })
  }

  if (path === 'auth/login') {
    const { email, password } = body
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return json({ error: 'Invalid email or password' }, 401)
    return json({ ok: true, user: { id: data.user.id, email: data.user.email } })
  }

  if (path === 'auth/logout') {
    await supabase.auth.signOut()
    return json({ ok: true })
  }

  if (path === 'auth/reset-request') {
    const { email } = body
    if (!email) return json({ error: 'Email is required' }, 400)
    const origin = new URL(request.url).origin
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/` })
    return json({ ok: true }) // do not reveal whether the email exists
  }

  if (path === 'auth/update-password') {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    const { password } = body
    if (!password) return json({ error: 'Password is required' }, 400)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  // -------- SAVED LEADS (create)
  if (path === 'saved-leads') {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    if (!body.lead_id) return json({ error: 'lead_id is required' }, 400)
    const { data, error } = await supabase
      .from('saved_leads')
      .insert({ profile_id: userId, lead_id: body.lead_id, status: body.status || 'New', notes: body.notes || null })
      .select('*, lead:leads(*)')
      .single()
    if (error) {
      if (/duplicate|unique/i.test(error.message)) return json({ error: 'Lead already saved' }, 409)
      return json({ error: error.message }, 400)
    }
    return json(data, 201)
  }

  // -------- SEARCH HISTORY (create)
  if (path === 'search-history') {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    const { data, error } = await supabase
      .from('search_history')
      .insert({
        profile_id: userId,
        query_text: body.query_text || null,
        filters: body.filters || {},
        result_count: body.result_count || 0,
      })
      .select('*')
      .single()
    if (error) return json({ error: error.message }, 400)
    return json(data, 201)
  }

  // -------- SOURCES (create/approve) — writes via service role
  if (path === 'sources') {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    if (!body.name || !body.domain || !(body.base_url || body.config?.feed_url)) {
      return json({ error: 'name, domain and base_url (or config.feed_url) are required' }, 400)
    }
    const { data, error } = await admin.from('sources').insert({
      name: body.name, domain: body.domain, base_url: body.base_url || null,
      source_type: body.source_type || 'other', connector: body.connector || 'generic_web',
      is_active: body.is_active ?? true, robots_allowed: body.robots_allowed ?? null,
      terms_ok: body.terms_ok ?? null, trust_level: body.trust_level ?? 50,
      config: body.config || {}, is_demo: false,
    }).select('*').single()
    if (error) {
      if (/duplicate|unique/i.test(error.message)) return json({ error: 'A source with this domain already exists' }, 409)
      return json({ error: error.message }, 400)
    }
    return json(data, 201)
  }

  // -------- LIVE DISCOVERY: run a user search against approved sources (max 20 opportunities per source)
  if (path === 'discover/search') {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    const query = {
      trade: body.trade || null, location: body.location || null, project_type: body.project_type || null,
      date_from: body.date_from || null, date_to: body.date_to || null, limit: Math.min(20, Number(body.limit) || 20),
    }
    let srcQ = admin.from('sources').select('id, name, domain, connector, is_active, is_demo, robots_allowed, trust_level, config')
      .eq('is_active', true).eq('is_demo', false).order('trust_level', { ascending: false })
    if (body.source_id) srcQ = srcQ.eq('id', body.source_id)
    const { data: allSources } = await srcQ
    // skip sources already known to be robots-blocked without an approved licence (they cannot yield leads)
    const sources = (allSources || []).filter((s) => body.source_id || s.robots_allowed !== false || s.config?.access_approved === true)
    if (!sources?.length) return json({ error: 'No active approved sources to search', runs: [], leads: [] }, 400)

    const runs = []
    for (const s of sources.slice(0, 4)) {
      try {
        const r = await runPipeline({ sourceId: s.id, userId, trigger: 'search', query })
        runs.push({ source_id: s.id, source_name: s.name, source_domain: s.domain, connector: s.connector, ...r })
      } catch (e) {
        runs.push({ source_id: s.id, source_name: s.name, source_domain: s.domain, connector: s.connector, status: 'failed', error: e.message, found: 0, verified: 0, rejected: 0, duplicated: 0 })
      }
    }
    // every opportunity that matched this search: newly created + previously known (duplicates), capped per source
    const ids = [...new Set(runs.flatMap((r) => [...(r.lead_ids || []), ...(r.duplicate_lead_ids || [])]))]
    let leads = []
    if (ids.length) {
      const { data: rows } = await admin.from('leads').select('*, source:sources(id, name, domain, trust_level, is_demo)').in('id', ids)
      const { data: ev } = await admin.from('lead_evidence').select('*').in('lead_id', ids).order('created_at', { ascending: true })
      const byLead = {}
      for (const e of ev || []) (byLead[e.lead_id] ||= []).push(e)
      leads = (rows || []).map((l) => ({ ...l, evidence: byLead[l.id] || [] })).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
    }
    const totals = runs.reduce((a, r) => ({ found: a.found + (r.found || 0), verified: a.verified + (r.verified || 0), rejected: a.rejected + (r.rejected || 0), duplicated: a.duplicated + (r.duplicated || 0) }), { found: 0, verified: 0, rejected: 0, duplicated: 0 })
    // record in the user's search history, linked to the first run
    const parts = [query.trade, query.location, query.project_type].filter(Boolean)
    await supabase.from('search_history').insert({
      profile_id: userId, query_text: parts.join(' · ') || 'All opportunities', filters: query,
      result_count: leads.length, search_run_id: runs[0]?.run_id || null,
    })
    return json({ query, runs, totals, leads })
  }

  // -------- RUN PIPELINE (SOURCE -> RETRIEVE -> ... -> LEAD)
  if (path === 'admin/run-pipeline') {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    if (!body.source_id) return json({ error: 'source_id is required' }, 400)
    try {
      const result = await runPipeline({ sourceId: body.source_id, userId, trigger: 'manual' })
      return json(result)
    } catch (e) {
      return json({ error: e.message }, 400)
    }
  }

  // -------- SCHEDULED RUNS: run every source that is due now (config.schedule_minutes)
  if (path === 'admin/run-due') {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    try { return json(await runDueSources({ trigger: 'manual_due' })) } catch (e) { return json({ error: e.message }, 400) }
  }

  // -------- PURGE ingested/test data for a source or a run
  if (path === 'admin/purge') {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    try {
      if (body.run_id) return json(await purgeRun(body.run_id))
      if (body.source_id) return json(await purgeSource(body.source_id, { deleteSource: body.delete_source === true }))
      return json({ error: 'source_id or run_id is required' }, 400)
    } catch (e) {
      return json({ error: e.message }, /not found/i.test(e.message) ? 404 : 400)
    }
  }

  return json({ error: 'Not found' }, 404)
}
export async function GET(request, context) {
  const parts = (await context.params)?.path || []
  const path = parts.join('/')
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  if (path === 'auth/me') {
    const userId = await getUserId(supabase)
    if (!userId) return json({ authenticated: false }, 200)
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single()
    return json({ authenticated: true, user: { id: userId }, profile: profile || null })
  }

  if (path === 'profile') {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (error) return json({ error: error.message }, 400)
    return json(data)
  }

  if (path === 'stats') {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const [available, saved, high, recent] = await Promise.all([
      supabase.from('leads').select('*', { count: 'exact', head: true }),
      supabase.from('saved_leads').select('*', { count: 'exact', head: true }),
      supabase.from('leads').select('*', { count: 'exact', head: true }).gte('lead_score', 80),
      supabase.from('leads').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
    ])
    return json({
      available_leads: available.count || 0,
      saved_leads: saved.count || 0,
      high_opportunity: high.count || 0,
      new_this_week: recent.count || 0,
    })
  }

  if (path === 'leads') {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    let q = supabase.from('leads').select('*, source:sources(name, domain, trust_level, is_demo)')
    const trade = searchParams.get('trade')
    const projectType = searchParams.get('project_type')
    const location = searchParams.get('location')
    const search = searchParams.get('q')
    const minValue = searchParams.get('min_value')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    if (trade) q = q.eq('trade_category', trade)
    if (projectType) q = q.eq('project_type', projectType)
    if (location) q = q.ilike('location', `%${location}%`)
    if (search) q = q.ilike('project_name', `%${search}%`)
    if (minValue) q = q.or(`estimated_trade_value.gte.${minValue},source_stated_value.gte.${minValue}`)
    if (dateFrom) q = q.gte('created_at', dateFrom)
    if (dateTo) q = q.lte('created_at', dateTo)
    q = q.order('created_at', { ascending: false }).limit(200)
    const { data, error } = await q
    if (error) return json({ error: error.message }, 400)
    return json(data || [])
  }

  if (parts[0] === 'leads' && parts[1]) {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    const id = parts[1]
    const { data: lead, error } = await supabase
      .from('leads').select('*, source:sources(*)').eq('id', id).single()
    if (error) return json({ error: 'Lead not found' }, 404)
    const { data: evidence } = await supabase
      .from('lead_evidence').select('*').eq('lead_id', id).order('created_at', { ascending: true })
    const { data: saved } = await supabase
      .from('saved_leads').select('*').eq('lead_id', id).eq('profile_id', userId).maybeSingle()
    return json({ ...lead, evidence: evidence || [], saved: saved || null })
  }

  if (path === 'saved-leads') {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    const { data, error } = await supabase
      .from('saved_leads')
      .select('*, lead:leads(*, source:sources(name, domain))')
      .order('created_at', { ascending: false })
    if (error) return json({ error: error.message }, 400)
    return json(data || [])
  }

  if (path === 'search-history') {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    const { data, error } = await supabase
      .from('search_history').select('*').order('created_at', { ascending: false }).limit(100)
    if (error) return json({ error: error.message }, 400)
    return json(data || [])
  }

  if (path === 'sources') {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    const { data, error } = await supabase
      .from('sources').select('*').order('created_at', { ascending: false })
    if (error) return json({ error: error.message }, 400)
    return json(data || [])
  }

  if (path === 'connectors') {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    return json(listConnectors())
  }

  // -------- CRON entrypoint for external schedulers (no cookie; shared secret)
  if (path === 'cron/run-due') {
    const secret = process.env.CRON_SECRET
    const provided = request.headers.get('x-cron-secret') || searchParams.get('secret')
    if (!secret) return json({ error: 'CRON_SECRET is not configured' }, 503)
    if (provided !== secret) return json({ error: 'Forbidden' }, 403)
    try { return json(await runDueSources({ trigger: 'cron' })) } catch (e) { return json({ error: e.message }, 400) }
  }

  // -------- ADMIN: which sources are due for a scheduled run
  if (path === 'admin/due') {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    const due = await listDueSources()
    return json(due.map((s) => ({ id: s.id, name: s.name, schedule_minutes: s.config?.schedule_minutes || 0, last_crawled_at: s.last_crawled_at })))
  }

  // -------- ADMIN / DEBUG: pipeline runs
  if (path === 'admin/runs') {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    const { data, error } = await supabase
      .from('search_runs').select('*').order('created_at', { ascending: false }).limit(50)
    if (error) return json({ error: error.message }, 400)
    return json(data || [])
  }

  if (parts[0] === 'admin' && parts[1] === 'runs' && parts[2]) {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    const runId = parts[2]
    const { data: run, error } = await supabase.from('search_runs').select('*').eq('id', runId).single()
    if (error) return json({ error: 'Run not found' }, 404)
    const { data: retrievals } = await supabase.from('retrievals')
      .select('id, source_url, source_domain, source_title, http_status, retrieval_status, content_hash, byte_size, error, retrieved_at')
      .eq('run_id', runId).order('retrieved_at', { ascending: true })
    const { data: logs } = await supabase.from('pipeline_logs')
      .select('*').eq('run_id', runId).order('created_at', { ascending: true })
    const { data: leads } = await supabase.from('leads')
      .select('id, project_name, trade_category, location, verification_status, source_url')
      .eq('search_run_id', runId).order('created_at', { ascending: true })
    return json({ ...run, retrievals: retrievals || [], logs: logs || [], leads: leads || [] })
  }

  return json({ error: 'Not found' }, 404)
}

// ------------------------------------------------------------------- PUT
export async function PUT(request, context) {
  const path = (await context.params)?.path?.join('/') || ''
  const body = await request.json().catch(() => ({}))
  const supabase = await createClient()

  if (path === 'profile') {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    const patch = {}
    for (const k of ['full_name', 'company_name', 'region']) if (k in body) patch[k] = body[k]
    if ('trade_focus' in body) patch.trade_focus = body.trade_focus
    patch.updated_at = new Date().toISOString()
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select('*').single()
    if (error) return json({ error: error.message }, 400)
    return json(data)
  }

  return json({ error: 'Not found' }, 404)
}

// ----------------------------------------------------------------- PATCH
export async function PATCH(request, context) {
  const parts = (await context.params)?.path || []
  const body = await request.json().catch(() => ({}))
  const supabase = await createClient()

  if (parts[0] === 'saved-leads' && parts[1]) {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    const patch = {}
    if ('status' in body) patch.status = body.status
    if ('notes' in body) patch.notes = body.notes
    patch.updated_at = new Date().toISOString()
    const { data, error } = await supabase
      .from('saved_leads').update(patch).eq('id', parts[1]).eq('profile_id', userId)
      .select('*, lead:leads(*, source:sources(name, domain))').single()
    if (error) return json({ error: error.message }, 400)
    return json(data)
  }

  if (parts[0] === 'sources' && parts[1]) {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    const patch = {}
    for (const k of ['is_active', 'robots_allowed', 'terms_ok', 'trust_level', 'name', 'base_url', 'source_type']) if (k in body) patch[k] = body[k]
    if ('config' in body && body.config && typeof body.config === 'object') {
      // merge into existing config so partial updates (e.g. schedule_minutes only) don't wipe other keys
      const { data: cur } = await admin.from('sources').select('config').eq('id', parts[1]).single()
      patch.config = { ...(cur?.config || {}), ...body.config }
    }
    patch.updated_at = new Date().toISOString()
    const { data, error } = await admin.from('sources').update(patch).eq('id', parts[1]).select('*').single()
    if (error) return json({ error: error.message }, 400)
    return json(data)
  }

  return json({ error: 'Not found' }, 404)
}

// ---------------------------------------------------------------- DELETE
export async function DELETE(request, context) {
  const parts = (await context.params)?.path || []
  const supabase = await createClient()

  if (parts[0] === 'saved-leads' && parts[1]) {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    const { error } = await supabase.from('saved_leads').delete().eq('id', parts[1]).eq('profile_id', userId)
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  if (parts[0] === 'search-history' && parts[1]) {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    const { error } = await supabase.from('search_history').delete().eq('id', parts[1]).eq('profile_id', userId)
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  // DELETE /api/sources/:id -> purge all ingested data, then remove the source (demo sources refused)
  if (parts[0] === 'sources' && parts[1]) {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    try { return json(await purgeSource(parts[1], { deleteSource: true })) }
    catch (e) { return json({ error: e.message }, /not found/i.test(e.message) ? 404 : 400) }
  }

  return json({ error: 'Not found' }, 404)
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 })
}

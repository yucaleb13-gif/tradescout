import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { admin } from '@/app/lib/supabase/admin'
import { runPipeline } from '@/app/lib/pipeline/engine'
import { listConnectors } from '@/app/lib/connectors/registry'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

  // -------- RUN PIPELINE (SOURCE -> RETRIEVE -> ... -> LEAD)
  if (path === 'admin/run-pipeline') {
    const userId = await getUserId(supabase)
    if (!userId) return json({ error: 'Unauthorized' }, 401)
    if (!body.source_id) return json({ error: 'source_id is required' }, 400)
    try {
      const result = await runPipeline({ sourceId: body.source_id, userId })
      return json(result)
    } catch (e) {
      return json({ error: e.message }, 400)
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
    if ('config' in body) patch.config = body.config
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

  return json({ error: 'Not found' }, 404)
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 })
}

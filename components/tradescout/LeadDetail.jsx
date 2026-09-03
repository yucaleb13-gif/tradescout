'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/tradescout/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { tradeLabel, money, UNAVAILABLE, VERIFICATION_STYLES, LEAD_STATUSES, SCORE_CATEGORY_STYLES, SCORE_CATEGORY_LABELS } from '@/lib/tradescout/constants'
import { ArrowLeft, Bookmark, BookmarkCheck, ExternalLink, ShieldCheck, FileText, Building2, MapPin, Calendar, Hash, Sparkles, Loader2, AlertTriangle, RefreshCw, Gauge, Check, Minus } from 'lucide-react'
import { toast } from 'sonner'

function Field({ label, value, icon: Icon }) {
  const missing = value === null || value === undefined || value === ''
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{Icon && <Icon className="h-3.5 w-3.5" />}{label}</div>
      <div className={missing ? 'text-sm italic text-slate-400' : 'text-sm font-medium'}>{missing ? UNAVAILABLE : value}</div>
    </div>
  )
}

const FIT_STYLE = { strong: 'bg-emerald-100 text-emerald-700 border-emerald-200', possible: 'bg-amber-100 text-amber-700 border-amber-200', weak: 'bg-slate-100 text-slate-600 border-slate-200', not_applicable: 'bg-rose-100 text-rose-700 border-rose-200' }

function AiCard({ lead, busy, onRun }) {
  const c = lead.ai_classification || null
  const ok = !!lead.ai_summary && c?.status === 'ok'
  const failed = c && c.status === 'failed'
  const evById = Object.fromEntries((lead.evidence || []).map((e) => [e.id, e]))
  const refs = (ids) => (ids || []).map((i) => evById[i]).filter(Boolean)
  const RefList = ({ ids }) => { const r = refs(ids); return r.length ? <span className="text-[11px] text-muted-foreground"> · evidence: {r.map((e) => e.field_name.replace('_', ' ')).join(', ')}</span> : null }
  return (
    <Card className="border-violet-200" data-testid="ai-card">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-600" /> AI analysis <Badge variant="outline" className="text-[10px] border-violet-200 text-violet-700">source-grounded</Badge></CardTitle>
          <Button size="sm" variant="outline" onClick={onRun} disabled={busy} data-testid="ai-run-btn">
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : (ok ? <RefreshCw className="h-4 w-4 mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />)}{ok ? 'Regenerate' : 'Generate summary'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">The AI only reads the retrieved source material and evidence above. It never adds facts; unknowns are stated as unknown. Source-derived fields are never overwritten.</p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!c && <p className="italic text-slate-400" data-testid="ai-empty">No AI summary yet. The lead is complete without it — generate one when you want a grounded overview.</p>}
        {failed && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 text-xs flex gap-2" data-testid="ai-failed"><AlertTriangle className="h-4 w-4 shrink-0" />
            <div><p className="font-medium">AI processing failed — verified source data kept as-is, nothing replaced.</p><p className="mt-1 break-words">{c.error}</p><p className="mt-1 text-[11px] text-amber-700">Attempted {new Date(c.attempted_at).toLocaleString()}</p></div></div>
        )}
        {ok && (
          <>
            <p className="leading-relaxed" data-testid="ai-summary">{lead.ai_summary}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-1">Suggested trade</p>
                <p className="font-medium">{c.trade_classification?.trade ? tradeLabel(c.trade_classification.trade) : <span className="italic text-slate-400">Not determinable from source</span>}</p>
                <p className="text-xs text-muted-foreground mt-1">{c.trade_classification?.rationale}<RefList ids={c.trade_classification?.evidence_ids} /></p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-1">Suggested project type</p>
                <p className="font-medium">{c.project_type_classification?.project_type || <span className="italic text-slate-400">Not determinable from source</span>}</p>
                <p className="text-xs text-muted-foreground mt-1">{c.project_type_classification?.rationale}<RefList ids={c.project_type_classification?.evidence_ids} /></p>
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 mb-1"><p className="text-xs text-muted-foreground">Relevance</p>{c.relevance?.fit && <Badge variant="outline" className={FIT_STYLE[c.relevance.fit]}>{c.relevance.fit.replace('_', ' ')} fit</Badge>}</div>
              <p className="text-sm">{c.relevance?.explanation}</p>
            </div>
            {c.unknowns?.length > 0 && (
              <div><p className="text-xs text-muted-foreground mb-1">Not stated by the source</p>
                <ul className="list-disc pl-5 space-y-0.5 text-sm text-slate-700">{c.unknowns.map((u, i) => <li key={i}>{u}</li>)}</ul></div>
            )}
            {c.evidence_groups?.length > 0 && (
              <div><p className="text-xs text-muted-foreground mb-1">Evidence organised</p>
                <div className="flex flex-wrap gap-1.5">{c.evidence_groups.map((g, i) => <Badge key={i} variant="outline" className="text-[11px]">{g.group}: {refs(g.evidence_ids).map((e) => e.field_name.replace('_', ' ')).join(', ') || '—'}</Badge>)}</div></div>
            )}
            <p className="text-[11px] text-muted-foreground">Model {lead.ai_model} · generated {new Date(lead.ai_generated_at).toLocaleString()} · validated against evidence{c.last_attempt ? ` · last regeneration attempt failed (${new Date(c.last_attempt.at).toLocaleString()}), previous summary kept` : ''}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ScoreCard({ lead }) {
  const sf = lead.score_factors
  const score = lead.lead_score
  const cat = lead.score_category || (sf && sf.category)
  if (score == null || !sf) {
    return (
      <Card data-testid="score-card">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4" /> Opportunity Score</CardTitle></CardHeader>
        <CardContent><p className="text-sm italic text-slate-400">Not yet scored.</p></CardContent>
      </Card>
    )
  }
  const factors = sf.factors || []
  return (
    <Card data-testid="score-card">
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4" /> Opportunity Score</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between">
          <div><span className="text-3xl font-bold tracking-tight" data-testid="score-value">{score}</span><span className="text-lg text-muted-foreground">/100</span></div>
          {cat && <Badge variant="outline" className={SCORE_CATEGORY_STYLES[cat]} data-testid="score-category">{SCORE_CATEGORY_LABELS[cat]}</Badge>}
        </div>
        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full ${cat === 'high' ? 'bg-emerald-500' : cat === 'good' ? 'bg-blue-500' : cat === 'moderate' ? 'bg-amber-500' : 'bg-slate-400'}`} style={{ width: `${score}%` }} />
        </div>
        <Separator />
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Why this opportunity received this score:</p>
          <ul className="space-y-2" data-testid="score-factors">
            {factors.map((f) => (
              <li key={f.key} className="flex items-start gap-2 text-sm">
                {f.awarded
                  ? <span className="mt-0.5 inline-flex items-center rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 tabular-nums">+{f.points}</span>
                  : <span className="mt-0.5 inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-400 tabular-nums">0</span>}
                <span className="flex-1">
                  <span className={f.awarded ? 'font-medium' : 'text-slate-400'}>{f.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{f.reason}</span>
                </span>
                {f.awarded ? <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-1" /> : <Minus className="h-3.5 w-3.5 text-slate-300 shrink-0 mt-1" />}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[11px] text-muted-foreground">Deterministic, evidence-based score. Factors that cannot be verified from the source earn zero — nothing is inferred or AI-generated.</p>
      </CardContent>
    </Card>
  )
}

export default function LeadDetail({ id, onBack }) {
  const [lead, setLead] = useState(null)
  const [saved, setSaved] = useState(null)
  const [aiBusy, setAiBusy] = useState(false)

  const runAi = async () => {
    setAiBusy(true)
    try {
      const r = await api(`ai/leads/${id}`, { method: 'POST', body: { force: true } })
      if (r.status === 'ok') toast.success(`Source-grounded summary generated (${r.model})`)
      else if (r.status === 'skipped') toast.info(`AI processing skipped: ${r.reason.replace(/_/g, ' ')}`)
      else toast.error(`AI processing failed — source data kept unchanged. ${r.error || ''}`)
      await load()
    } catch (e) { toast.error(e.message) } finally { setAiBusy(false) }
  }

  const load = async () => {
    try { const d = await api(`leads/${id}`); setLead(d); setSaved(d.saved) }
    catch (e) { toast.error(e.message) }
  }
  useEffect(() => { load() }, [id])

  const toggleSave = async () => {
    try {
      if (saved) { await api(`saved-leads/${saved.id}`, { method: 'DELETE' }); setSaved(null); toast.success('Removed from saved') }
      else { const s = await api('saved-leads', { method: 'POST', body: { lead_id: id } }); setSaved(s); toast.success('Saved') }
    } catch (e) { toast.error(e.message) }
  }
  const changeStatus = async (status) => {
    try { const s = await api(`saved-leads/${saved.id}`, { method: 'PATCH', body: { status } }); setSaved(s); toast.success('Status updated') }
    catch (e) { toast.error(e.message) }
  }

  if (!lead) return <div className="space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-64 w-full" /></div>

  const stated = money(lead.source_stated_value, lead.source_stated_value_currency)
  const est = money(lead.estimated_trade_value, lead.estimated_trade_value_currency)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <div className="flex items-center gap-2">
          {saved && (
            <Select value={saved.status} onValueChange={changeStatus}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button onClick={toggleSave} variant={saved ? 'outline' : 'default'} className={saved ? '' : 'bg-amber-500 hover:bg-amber-600 text-slate-900'}>
            {saved ? <><BookmarkCheck className="h-4 w-4 mr-2" />Saved</> : <><Bookmark className="h-4 w-4 mr-2" />Save lead</>}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{lead.project_name || 'Untitled project'}</h1>
        {lead.is_demo && <Badge variant="outline" className="border-amber-300 text-amber-700">DEMO</Badge>}
        <Badge variant="outline" className={VERIFICATION_STYLES[lead.verification_status]}>{lead.verification_status.replace('_', ' ')}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Project details</CardTitle></CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Field label="Trade" value={tradeLabel(lead.trade_category)} icon={Hash} />
              <Field label="Project type" value={lead.project_type} icon={FileText} />
              <Field label="Location" value={lead.location} icon={MapPin} />
              <Field label="Address" value={lead.address} icon={MapPin} />
              <Field label="Tender status" value={lead.tender_status && lead.tender_status !== 'unknown' ? lead.tender_status.replace('_', ' ') : null} icon={Calendar} />
              <Field label="Timeline" value={lead.timeline_text} icon={Calendar} />
              <div className="sm:col-span-2"><Field label="Summary" value={lead.project_description} icon={FileText} /></div>
            </CardContent>
          </Card>

          {!lead.is_demo && <AiCard lead={lead} busy={aiBusy} onRun={runAi} />}

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Company & contact</CardTitle></CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Field label="Company" value={lead.company_name} />
              <Field label="Contact" value={lead.contact_name} />
              <Field label="Email" value={lead.contact_email} />
              <Field label="Phone" value={lead.contact_phone} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Evidence</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(!lead.evidence || lead.evidence.length === 0) && <p className="text-sm italic text-slate-400">No evidence recorded for this lead.</p>}
              {lead.evidence?.map((ev) => (
                <div key={ev.id} className="rounded-lg border p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{ev.field_name.replace('_', ' ')}</span>
                    <Badge variant="outline" className="text-[10px]">{ev.extraction_method}</Badge>
                  </div>
                  <p className="text-muted-foreground">{ev.retrieved_content || UNAVAILABLE}</p>
                  <a href={ev.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-amber-600 hover:underline">{ev.source_domain} <ExternalLink className="h-3 w-3" /></a>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Opportunity value</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><p className="text-xs text-muted-foreground">Source-stated project value</p>
                <p className={stated ? 'text-lg font-semibold' : 'text-sm italic text-slate-400'}>{stated || UNAVAILABLE}</p></div>
              <Separator />
              <div><div className="text-xs text-muted-foreground flex items-center gap-1">Estimated trade opportunity <Badge variant="outline" className="text-[10px]">estimate</Badge></div>
                <p className={est ? 'text-lg font-semibold text-amber-700' : 'text-sm italic text-slate-400'}>{est || UNAVAILABLE}</p>
                {lead.estimation_method && <p className="text-[11px] text-muted-foreground mt-1">Method: {lead.estimation_method.replace(/_/g, ' ')}{lead.estimation_confidence != null ? ` · confidence ${Math.round(lead.estimation_confidence * 100)}%` : ''}</p>}</div>
            </CardContent>
          </Card>

          <ScoreCard lead={lead} />

          <Card>
            <CardHeader><CardTitle className="text-base">Source</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Field label="Source name" value={lead.source?.name} />
              <Field label="Domain" value={lead.source?.domain} />
              <a href={lead.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-amber-600 hover:underline break-all">{lead.source_url} <ExternalLink className="h-3 w-3 shrink-0" /></a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

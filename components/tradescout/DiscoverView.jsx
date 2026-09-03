'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/tradescout/api'
import { DemoBanner } from './DemoBanner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TRADES, PROJECT_TYPES, RADIUS_OPTIONS, tradeLabel, money, VERIFICATION_STYLES, SCORE_CATEGORY_STYLES, SCORE_CATEGORY_LABELS, scoreCategoryOf } from '@/lib/tradescout/constants'
import { Search, Radar, LayoutGrid, List, Bookmark, Satellite, Loader2, ExternalLink, ChevronDown, ChevronUp, ShieldCheck, FileText } from 'lucide-react'
import { toast } from 'sonner'

const ANY = 'any'

export default function DiscoverView({ onOpenLead }) {
  const [f, setF] = useState({ trade: ANY, location: '', radius: '50', projectType: ANY, dateFrom: '', dateTo: '', minValue: '' })
  const [leads, setLeads] = useState(null)
  const [view, setView] = useState('table')
  const [saving, setSaving] = useState(false)
  const [results, setResults] = useState(null) // { query, runs, totals, leads }
  const [openRow, setOpenRow] = useState(null)
  const [sort, setSort] = useState('score_desc')
  const [catFilter, setCatFilter] = useState(ANY)

  const displayLeads = (() => {
    if (!leads) return leads
    let out = leads
    if (catFilter !== ANY) out = out.filter((l) => (l.score_category || scoreCategoryOf(l.lead_score)) === catFilter)
    const s = (l) => (l.lead_score == null ? -1 : l.lead_score)
    out = [...out].sort((a, b) => {
      if (sort === 'score_desc') return s(b) - s(a)
      if (sort === 'score_asc') return s(a) - s(b)
      if (sort === 'recent') return new Date(b.created_at || 0) - new Date(a.created_at || 0)
      return 0
    })
    return out
  })()

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams()
    if (f.trade !== ANY) p.set('trade', f.trade)
    if (f.projectType !== ANY) p.set('project_type', f.projectType)
    if (f.location) p.set('location', f.location)
    if (f.minValue) p.set('min_value', f.minValue)
    if (f.dateFrom) p.set('date_from', f.dateFrom)
    if (f.dateTo) p.set('date_to', f.dateTo)
    return p.toString()
  }, [f])

  const loadLeads = useCallback(async () => {
    setLeads(null)
    try { setLeads(await api(`leads?${buildQuery()}`)) } catch (e) { toast.error(e.message); setLeads([]) }
  }, [buildQuery])

  useEffect(() => { loadLeads() }, []) // initial load

  const findOpportunities = async () => {
    setSaving(true); setResults(null); setOpenRow(null)
    try {
      const r = await api('discover/search', { method: 'POST', body: {
        trade: f.trade === ANY ? null : f.trade, location: f.location || null, project_type: f.projectType === ANY ? null : f.projectType,
        date_from: f.dateFrom || null, date_to: f.dateTo || null, limit: 20 } })
      setResults(r)
      if (r.leads.length === 0) toast.info('Zero legitimate opportunities matched — nothing was fabricated to fill the gap')
      else toast.success(`${r.leads.length} opportunit${r.leads.length === 1 ? 'y' : 'ies'} found · ${r.totals.found} new · ${r.totals.duplicated} already known`)
      loadLeads()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const FIELD_LABELS = { project_name: 'Project', project_type: 'Project type', trade_category: 'Trade', location: 'Location', company_name: 'Organization', contact_name: 'Contact', contact_email: 'Email', contact_phone: 'Phone', bid_deadline: 'Bid deadline', tender_status: 'Tender status', timeline_text: 'Timeline', timeline_start: 'Contract start', timeline_end: 'Contract end', source_stated_value: 'Source-stated value', project_description: 'Description' }
  const extractedFields = (l) => Object.keys(FIELD_LABELS).filter((k) => l[k] !== null && l[k] !== undefined && l[k] !== '' && !(k === 'tender_status' && l[k] === 'unknown'))

  const save = async (id) => {
    try { await api('saved-leads', { method: 'POST', body: { lead_id: id } }); toast.success('Lead saved') }
    catch (e) { toast.error(e.message) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Discover Leads</h1>
        <p className="text-muted-foreground">Set your criteria for opportunity discovery.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Radar className="h-4 w-4 text-amber-600" /> Search criteria</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2"><Label>Trade</Label>
              <Select value={f.trade} onValueChange={(v) => setF({ ...f, trade: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={ANY}>Any trade</SelectItem>{TRADES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Location</Label><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="City, region" /></div>
            <div className="space-y-2"><Label>Radius</Label>
              <Select value={f.radius} onValueChange={(v) => setF({ ...f, radius: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RADIUS_OPTIONS.map((r) => <SelectItem key={r} value={String(r)}>{r} miles</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Project type</Label>
              <Select value={f.projectType} onValueChange={(v) => setF({ ...f, projectType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={ANY}>Any type</SelectItem>{PROJECT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Min. opportunity value (USD)</Label><Input type="number" min="0" value={f.minValue} onChange={(e) => setF({ ...f, minValue: e.target.value })} placeholder="e.g. 100000" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2"><Label>From</Label><Input type="date" value={f.dateFrom} onChange={(e) => setF({ ...f, dateFrom: e.target.value })} /></div>
              <div className="space-y-2"><Label>To</Label><Input type="date" value={f.dateTo} onChange={(e) => setF({ ...f, dateTo: e.target.value })} /></div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            <Button onClick={findOpportunities} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-slate-900" data-testid="find-opportunities">{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Satellite className="h-4 w-4 mr-2" />}{saving ? 'Searching approved sources…' : 'Find Opportunities'}</Button>
            <Button variant="outline" onClick={loadLeads}><Search className="h-4 w-4 mr-2" />Apply filters to available leads</Button>
          </div>
        </CardContent>
      </Card>

      {saving && <Alert className="border-slate-300 bg-slate-50"><Loader2 className="h-4 w-4 animate-spin" /><AlertTitle>Searching approved sources…</AlertTitle><AlertDescription>Retrieving each source, extracting only explicitly stated facts and attaching evidence. Large datasets can take 10–30 seconds.</AlertDescription></Alert>}

      {results && (
        <Card data-testid="search-results">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" />Live search results ({results.leads.length})</CardTitle>
            <div className="flex flex-wrap gap-2 pt-1">
              {results.runs.map((r) => (
                <Badge key={r.source_id} variant="outline" className={r.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}>
                  {r.source_name}: {r.status}{r.status === 'completed' ? ` · ${r.found} new · ${r.duplicated} known · ${r.rejected} rejected` : (r.error ? ` · ${r.error}` : '')}
                </Badge>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {results.leads.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">Zero legitimate opportunities matched your criteria in the approved sources. No results are generated to fill a target.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead className="w-8"></TableHead><TableHead>Project</TableHead><TableHead>Source</TableHead><TableHead>URL</TableHead><TableHead>Fields</TableHead><TableHead>Evidence</TableHead><TableHead>Verification</TableHead></TableRow></TableHeader>
                <TableBody>
                  {results.leads.map((l) => {
                    const open = openRow === l.id
                    const fields = extractedFields(l)
                    return [
                      <TableRow key={l.id} className="cursor-pointer" onClick={() => setOpenRow(open ? null : l.id)} data-testid={`result-row-${l.id}`}>
                        <TableCell>{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</TableCell>
                        <TableCell className="font-medium max-w-xs"><span className="line-clamp-2">{l.project_name || 'Untitled'}</span></TableCell>
                        <TableCell className="text-sm">{l.source?.name || '—'}<p className="text-[11px] text-muted-foreground">{l.source?.domain}</p></TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}><a href={l.source_url} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline inline-flex items-center gap-1 text-xs max-w-[180px] truncate"><ExternalLink className="h-3 w-3 shrink-0" />{l.source_url.replace(/^https?:\/\//, '')}</a></TableCell>
                        <TableCell className="text-sm">{fields.length}</TableCell>
                        <TableCell className="text-sm">{l.evidence.length}</TableCell>
                        <TableCell><Badge variant="outline" className={VERIFICATION_STYLES[l.verification_status]}>{l.verification_status.replace('_', ' ')}</Badge></TableCell>
                      </TableRow>,
                      open && (
                        <TableRow key={l.id + '-detail'} className="bg-slate-50 hover:bg-slate-50">
                          <TableCell colSpan={7} className="p-4">
                            <div className="grid gap-4 lg:grid-cols-2">
                              <div>
                                <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Extracted fields (source-stated only)</p>
                                <dl className="space-y-1 text-sm">
                                  {fields.filter((k) => k !== 'project_description').map((k) => (
                                    <div key={k} className="grid grid-cols-[130px_1fr] gap-2"><dt className="text-muted-foreground">{FIELD_LABELS[k]}</dt><dd className="break-words">{k === 'trade_category' ? tradeLabel(l[k]) : String(l[k])}</dd></div>
                                  ))}
                                  {['contact_email', 'contact_phone', 'source_stated_value', 'location', 'bid_deadline'].filter((k) => !fields.includes(k)).map((k) => (
                                    <div key={k} className="grid grid-cols-[130px_1fr] gap-2"><dt className="text-muted-foreground">{FIELD_LABELS[k]}</dt><dd className="italic text-slate-400">Not available in source</dd></div>
                                  ))}
                                </dl>
                                {l.ai_summary && l.ai_classification?.status === 'ok' && (
                                  <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/50 p-3" data-testid="result-ai-summary">
                                    <p className="text-xs font-semibold uppercase text-violet-700 mb-1">AI summary · source-grounded{l.ai_classification.relevance?.fit ? ` · ${l.ai_classification.relevance.fit.replace('_', ' ')} fit` : ''}</p>
                                    <p className="text-sm">{l.ai_summary}</p>
                                  </div>
                                )}
                                {l.project_description && <div className="mt-3"><p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Description</p><p className="text-sm whitespace-pre-line line-clamp-6">{l.project_description}</p></div>}
                                <div className="mt-3 flex gap-2">
                                  <Button size="sm" variant="outline" onClick={() => onOpenLead(l.id)}>Open lead</Button>
                                  <Button size="sm" variant="ghost" onClick={() => save(l.id)}><Bookmark className="h-4 w-4 mr-1" />Save</Button>
                                </div>
                              </div>
                              <div>
                                <p className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1"><FileText className="h-3 w-3" />Evidence ({l.evidence.length})</p>
                                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                  {l.evidence.map((e) => (
                                    <div key={e.id} className="rounded border bg-white p-2 text-xs">
                                      <div className="flex items-center justify-between gap-2"><Badge variant="outline" className="text-[10px]">{e.field_name}</Badge><span className="text-muted-foreground">{e.extraction_method}</span></div>
                                      <p className="mt-1 font-medium break-words">{e.extracted_value}</p>
                                      <p className="mt-1 text-muted-foreground break-words line-clamp-3">“{e.retrieved_content}”</p>
                                      <a href={e.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sky-700 hover:underline break-all"><ExternalLink className="h-3 w-3 shrink-0" />{e.source_domain}</a>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ),
                    ]
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <DemoBanner />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Available leads in your workspace</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="h-8 w-[170px]" data-testid="score-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All opportunities</SelectItem>
              <SelectItem value="high">{SCORE_CATEGORY_LABELS.high}</SelectItem>
              <SelectItem value="good">{SCORE_CATEGORY_LABELS.good}</SelectItem>
              <SelectItem value="moderate">{SCORE_CATEGORY_LABELS.moderate}</SelectItem>
              <SelectItem value="low">{SCORE_CATEGORY_LABELS.low}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-8 w-[170px]" data-testid="score-sort"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="score_desc">Highest score first</SelectItem>
              <SelectItem value="score_asc">Lowest score first</SelectItem>
              <SelectItem value="recent">Most recent</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            <Button size="icon" variant={view === 'table' ? 'default' : 'outline'} onClick={() => setView('table')} className="h-8 w-8"><List className="h-4 w-4" /></Button>
            <Button size="icon" variant={view === 'cards' ? 'default' : 'outline'} onClick={() => setView('cards')} className="h-8 w-8"><LayoutGrid className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>

      {!leads && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>}
      {leads && displayLeads.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground">No leads match your filters.</CardContent></Card>}

      {leads && displayLeads.length > 0 && view === 'table' && (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Project</TableHead><TableHead>Trade</TableHead><TableHead>Location</TableHead>
              <TableHead>Est. trade value</TableHead><TableHead>Score</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {displayLeads.map((l) => (
                <TableRow key={l.id} className="cursor-pointer" onClick={() => onOpenLead(l.id)}>
                  <TableCell className="font-medium"><div className="flex items-center gap-2">{l.project_name || 'Untitled'}{l.is_demo && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">DEMO</Badge>}</div></TableCell>
                  <TableCell>{tradeLabel(l.trade_category) || '—'}</TableCell>
                  <TableCell>{l.location || '—'}</TableCell>
                  <TableCell>{money(l.estimated_trade_value, l.estimated_trade_value_currency) || '—'}</TableCell>
                  <TableCell>
                    {l.lead_score == null ? '—' : (
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">{l.lead_score}</span>
                        {(() => { const c = l.score_category || scoreCategoryOf(l.lead_score); return c ? <Badge variant="outline" className={`text-[10px] ${SCORE_CATEGORY_STYLES[c]}`}>{SCORE_CATEGORY_LABELS[c]}</Badge> : null })()}
                      </div>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="outline" className={VERIFICATION_STYLES[l.verification_status]}>{l.verification_status.replace('_', ' ')}</Badge></TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}><Button size="sm" variant="ghost" onClick={() => save(l.id)}><Bookmark className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      {leads && displayLeads.length > 0 && view === 'cards' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayLeads.map((l) => (
            <Card key={l.id} className="cursor-pointer hover:border-amber-300 transition" onClick={() => onOpenLead(l.id)}>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="outline">{tradeLabel(l.trade_category) || '—'}</Badge>
                  {l.is_demo && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">DEMO</Badge>}
                </div>
                <div><h3 className="font-medium leading-tight">{l.project_name || 'Untitled project'}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{l.location || 'Location N/A'} · {l.project_type || '—'}</p></div>
                {l.lead_score != null && (() => { const c = l.score_category || scoreCategoryOf(l.lead_score); return (
                  <div className="flex items-center gap-2"><span className="text-sm font-semibold tabular-nums">{l.lead_score}/100</span>{c && <Badge variant="outline" className={`text-[10px] ${SCORE_CATEGORY_STYLES[c]}`}>{SCORE_CATEGORY_LABELS[c]}</Badge>}</div>
                ) })()}
                <div className="flex items-center justify-between pt-2 border-t">
                  <div><p className="text-sm font-semibold">{money(l.estimated_trade_value, l.estimated_trade_value_currency) || '—'}</p><p className="text-[10px] text-muted-foreground">est. trade value</p></div>
                  <Badge variant="outline" className={VERIFICATION_STYLES[l.verification_status]}>{l.verification_status.replace('_', ' ')}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

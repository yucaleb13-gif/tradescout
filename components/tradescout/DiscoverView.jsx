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
import { TRADES, PROJECT_TYPES, RADIUS_OPTIONS, tradeLabel, money, VERIFICATION_STYLES } from '@/lib/tradescout/constants'
import { Search, Radar, LayoutGrid, List, Bookmark, Satellite } from 'lucide-react'
import { toast } from 'sonner'

const ANY = 'any'

export default function DiscoverView({ onOpenLead }) {
  const [f, setF] = useState({ trade: ANY, location: '', radius: '50', projectType: ANY, dateFrom: '', dateTo: '', minValue: '' })
  const [leads, setLeads] = useState(null)
  const [view, setView] = useState('table')
  const [notConnected, setNotConnected] = useState(false)
  const [saving, setSaving] = useState(false)

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
    setSaving(true)
    const filters = { trade: f.trade === ANY ? null : f.trade, location: f.location || null, radius_miles: Number(f.radius),
      project_type: f.projectType === ANY ? null : f.projectType, date_from: f.dateFrom || null, date_to: f.dateTo || null,
      min_opportunity_value: f.minValue ? Number(f.minValue) : null }
    const parts = [tradeLabel(f.trade === ANY ? null : f.trade), f.location, f.projectType === ANY ? null : f.projectType].filter(Boolean)
    try {
      await api('search-history', { method: 'POST', body: { query_text: parts.join(' · ') || 'All opportunities', filters, result_count: 0 } })
      setNotConnected(true)
      toast.success('Search saved to your history')
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

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
            <Button onClick={findOpportunities} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-slate-900"><Satellite className="h-4 w-4 mr-2" />Find Opportunities</Button>
            <Button variant="outline" onClick={loadLeads}><Search className="h-4 w-4 mr-2" />Apply filters to available leads</Button>
          </div>
        </CardContent>
      </Card>

      {notConnected && (
        <Alert className="border-slate-300 bg-slate-50">
          <Satellite className="h-4 w-4" />
          <AlertTitle>Live opportunity discovery is not connected yet.</AlertTitle>
          <AlertDescription>Your search criteria were saved to Search History. Automated discovery from public sources will be enabled in a later phase — no results are fabricated.</AlertDescription>
        </Alert>
      )}

      <DemoBanner />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Available leads in your workspace</h2>
        <div className="flex gap-1">
          <Button size="icon" variant={view === 'table' ? 'default' : 'outline'} onClick={() => setView('table')} className="h-8 w-8"><List className="h-4 w-4" /></Button>
          <Button size="icon" variant={view === 'cards' ? 'default' : 'outline'} onClick={() => setView('cards')} className="h-8 w-8"><LayoutGrid className="h-4 w-4" /></Button>
        </div>
      </div>

      {!leads && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>}
      {leads && leads.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground">No leads match your filters.</CardContent></Card>}

      {leads && leads.length > 0 && view === 'table' && (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Project</TableHead><TableHead>Trade</TableHead><TableHead>Location</TableHead>
              <TableHead>Est. trade value</TableHead><TableHead>Score</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {leads.map((l) => (
                <TableRow key={l.id} className="cursor-pointer" onClick={() => onOpenLead(l.id)}>
                  <TableCell className="font-medium"><div className="flex items-center gap-2">{l.project_name || 'Untitled'}{l.is_demo && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">DEMO</Badge>}</div></TableCell>
                  <TableCell>{tradeLabel(l.trade_category) || '—'}</TableCell>
                  <TableCell>{l.location || '—'}</TableCell>
                  <TableCell>{money(l.estimated_trade_value, l.estimated_trade_value_currency) || '—'}</TableCell>
                  <TableCell>{l.lead_score ?? '—'}</TableCell>
                  <TableCell><Badge variant="outline" className={VERIFICATION_STYLES[l.verification_status]}>{l.verification_status.replace('_', ' ')}</Badge></TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}><Button size="sm" variant="ghost" onClick={() => save(l.id)}><Bookmark className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      {leads && leads.length > 0 && view === 'cards' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {leads.map((l) => (
            <Card key={l.id} className="cursor-pointer hover:border-amber-300 transition" onClick={() => onOpenLead(l.id)}>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="outline">{tradeLabel(l.trade_category) || '—'}</Badge>
                  {l.is_demo && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">DEMO</Badge>}
                </div>
                <div><h3 className="font-medium leading-tight">{l.project_name || 'Untitled project'}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{l.location || 'Location N/A'} · {l.project_type || '—'}</p></div>
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

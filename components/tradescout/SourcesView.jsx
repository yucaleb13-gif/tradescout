'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/tradescout/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Database, Info, Plus, Play, Loader2, MoreHorizontal, Trash2, Eraser, FileSearch, ShieldCheck, ShieldX, ShieldQuestion, Clock, Timer } from 'lucide-react'
import { toast } from 'sonner'

const TYPES = [
  ['government_tender', 'Government Tender'], ['municipal_portal', 'Municipal Portal'], ['permit_database', 'Permit Database'],
  ['procurement_portal', 'Procurement Portal'], ['rss_feed', 'RSS Feed'], ['news', 'News'], ['company_site', 'Company Site'], ['other', 'Other'],
]
const TYPE_LABEL = Object.fromEntries(TYPES)
const SCHEDULES = [['0', 'Manual'], ['60', 'Every hour'], ['360', 'Every 6 hours'], ['720', 'Every 12 hours'], ['1440', 'Daily'], ['10080', 'Weekly']]
const SCHEDULE_LABEL = Object.fromEntries(SCHEDULES)

const EMPTY_FORM = { name: '', domain: '', base_url: '', source_type: 'rss_feed', trust_level: 60, is_active: true, terms_ok: true, fetch_details: false, schedule_minutes: '0' }

function RobotsBadge({ value }) {
  if (value === true) return <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700" title="robots.txt checked on last run: allowed"><ShieldCheck className="h-3 w-3" />allowed</Badge>
  if (value === false) return <Badge variant="outline" className="gap-1 border-rose-200 bg-rose-50 text-rose-700" title="robots.txt disallows this URL — runs are blocked"><ShieldX className="h-3 w-3" />blocked</Badge>
  return <Badge variant="outline" className="gap-1 text-slate-500" title="Checked automatically on the next run"><ShieldQuestion className="h-3 w-3" />unchecked</Badge>
}

export default function SourcesView({ onRan }) {
  const [sources, setSources] = useState(null)
  const [running, setRunning] = useState(null)
  const [runningDue, setRunningDue] = useState(false)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [confirm, setConfirm] = useState(null) // { source, mode: 'purge' | 'delete' }
  const [busyConfirm, setBusyConfirm] = useState(false)

  const load = async () => { try { setSources(await api('sources')) } catch (e) { toast.error(e.message); setSources([]) } }
  useEffect(() => { load() }, [])

  const addSource = async () => {
    if (!form.name || !form.domain || !form.base_url) { toast.error('Name, domain and source URL are required'); return }
    setSaving(true)
    try {
      const { fetch_details, schedule_minutes, ...rest } = form
      await api('sources', { method: 'POST', body: { ...rest, trust_level: Number(form.trust_level), config: { fetch_details, schedule_minutes: Number(schedule_minutes) || 0, max_detail_fetch: 10 } } })
      toast.success('Source added — robots.txt will be checked on the first run'); setOpen(false); setForm(EMPTY_FORM); load()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const describeRun = (r) => {
    if (r.status === 'failed') return null
    const extra = r.details_fetched ? ` · ${r.details_fetched} detail page(s)` : ''
    return `Run ${r.status}: ${r.found} created · ${r.verified} verified · ${r.rejected} rejected · ${r.duplicated} duplicate${extra}`
  }

  const run = async (s) => {
    setRunning(s.id)
    try {
      const r = await api('admin/run-pipeline', { method: 'POST', body: { source_id: s.id } })
      if (r.status === 'failed') toast.error('Run failed — source blocked or retrieval could not complete. No leads created. See Admin / Debug.')
      else toast.success(describeRun(r))
      onRan && onRan()
    } catch (e) { toast.error(e.message) } finally { setRunning(null); load() }
  }

  const runDue = async () => {
    setRunningDue(true)
    try {
      const r = await api('admin/run-due', { method: 'POST' })
      if (r.skipped) toast.info('Scheduler is already running')
      else if (!r.due) toast.info('No scheduled sources are due right now')
      else toast.success(`Ran ${r.results.length} due source(s): ${r.results.map((x) => `${x.source_name} → ${x.status}`).join(', ')}`)
      onRan && onRan()
    } catch (e) { toast.error(e.message) } finally { setRunningDue(false); load() }
  }

  const patch = async (s, body, optimistic) => {
    setSources((p) => p.map((x) => x.id === s.id ? { ...x, ...optimistic } : x))
    try { await api(`sources/${s.id}`, { method: 'PATCH', body }) } catch (e) { toast.error(e.message); load() }
  }
  const toggleActive = (s, v) => patch(s, { is_active: v }, { is_active: v })
  const setSchedule = (s, v) => { patch(s, { config: { schedule_minutes: Number(v) } }, { config: { ...(s.config || {}), schedule_minutes: Number(v) } }); toast.success(v === '0' ? 'Scheduled runs disabled' : `Scheduled: ${SCHEDULE_LABEL[v].toLowerCase()}`) }
  const toggleDetails = (s) => { const v = !(s.config?.fetch_details === true); patch(s, { config: { fetch_details: v } }, { config: { ...(s.config || {}), fetch_details: v } }); toast.success(v ? 'Detail fetch enabled for this source' : 'Detail fetch disabled') }

  const doConfirm = async () => {
    if (!confirm) return
    setBusyConfirm(true)
    try {
      const r = confirm.mode === 'delete'
        ? await api(`sources/${confirm.source.id}`, { method: 'DELETE' })
        : await api('admin/purge', { method: 'POST', body: { source_id: confirm.source.id } })
      toast.success(`${confirm.mode === 'delete' ? 'Source deleted' : 'Data purged'}: ${r.leads} lead(s), ${r.runs} run(s), ${r.retrievals} retrieval(s), ${r.logs} log(s) removed`)
      setConfirm(null); onRan && onRan(); load()
    } catch (e) { toast.error(e.message) } finally { setBusyConfirm(false) }
  }

  const fmt = (d) => d ? new Date(d).toLocaleString() : null
  const scheduled = (sources || []).filter((s) => Number(s.config?.schedule_minutes) > 0 && s.is_active).length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div><h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
          <p className="text-muted-foreground">Registry of approved public sources. Every real lead must originate here.</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runDue} disabled={runningDue} data-testid="run-due-btn">
            {runningDue ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Timer className="h-4 w-4 mr-2" />}Run due now
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-amber-500 hover:bg-amber-600 text-slate-900" data-testid="add-source-btn"><Plus className="h-4 w-4 mr-2" />Add source</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Approve a new source</DialogTitle>
                <DialogDescription>Add a real, publicly accessible source (an RSS/Atom feed works best). robots.txt is verified automatically before every retrieval.</DialogDescription></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Name</Label><Input data-testid="source-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="City of X – Bids" /></div>
                  <div className="space-y-1"><Label>Domain</Label><Input data-testid="source-domain" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="bids.cityofx.gov" /></div>
                </div>
                <div className="space-y-1"><Label>Source URL (feed or page)</Label><Input data-testid="source-url" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="https://…/rss" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Type</Label>
                    <Select value={form.source_type} onValueChange={(v) => setForm({ ...form, source_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label>Reliability (0–100)</Label><Input type="number" min="0" max="100" value={form.trust_level} onChange={(e) => setForm({ ...form, trust_level: e.target.value })} /></div>
                </div>
                <div className="space-y-1"><Label>Scheduled runs</Label>
                  <Select value={form.schedule_minutes} onValueChange={(v) => setForm({ ...form, schedule_minutes: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SCHEDULES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-6 pt-1">
                  <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />Active</label>
                  <label className="flex items-center gap-2 text-sm"><Switch checked={form.terms_ok} onCheckedChange={(v) => setForm({ ...form, terms_ok: v })} />Terms OK</label>
                  <label className="flex items-center gap-2 text-sm"><Switch checked={form.fetch_details} onCheckedChange={(v) => setForm({ ...form, fetch_details: v })} />Fetch item pages</label>
                </div>
                <p className="text-xs text-muted-foreground">“Fetch item pages” retrieves up to 10 linked pages per run to evidence extra fields (value, location, contact) that the feed itself does not state. Slower, but every value still maps to a real snippet.</p>
              </div>
              <DialogFooter><Button onClick={addSource} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-slate-900" data-testid="source-submit">{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Add source</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Alert className="border-slate-300 bg-slate-50">
        <Info className="h-4 w-4" />
        <AlertDescription>Add one approved source and click <span className="font-medium">Run ingestion</span> to execute the verification pipeline (SOURCE → ROBOTS → RETRIEVE → EXTRACT → EVIDENCE → VALIDATE → LEAD). Watch results in <span className="font-medium">Admin / Debug</span>. Nothing is fabricated — unsupported fields stay empty.
          {scheduled > 0 && <span className="block mt-1 text-slate-600"><Clock className="inline h-3 w-3 mr-1" />{scheduled} source{scheduled > 1 ? 's' : ''} on a schedule — due sources run automatically in the background, or use <span className="font-medium">Run due now</span>.</span>}
        </AlertDescription>
      </Alert>

      {!sources && <Skeleton className="h-40 w-full" />}
      {sources && sources.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground"><Database className="h-8 w-8 mx-auto mb-2 opacity-40" />No sources yet. Add your first approved source.</CardContent></Card>}

      {sources && sources.length > 0 && (
        <Card><CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Source name</TableHead><TableHead>Domain</TableHead><TableHead>Type</TableHead>
              <TableHead>Active</TableHead><TableHead>Robots</TableHead><TableHead className="w-36">Reliability</TableHead>
              <TableHead>Schedule</TableHead><TableHead>Last checked</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {sources.map((s) => (
                <TableRow key={s.id} data-testid={`source-row-${s.id}`}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2 flex-wrap">{s.name}
                      {s.is_demo && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">DEMO</Badge>}
                      {s.config?.fetch_details === true && <Badge variant="outline" className="text-[10px] gap-1 text-slate-600"><FileSearch className="h-3 w-3" />detail fetch</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.domain}</TableCell>
                  <TableCell>{TYPE_LABEL[s.source_type] || s.source_type}</TableCell>
                  <TableCell><Switch checked={!!s.is_active} onCheckedChange={(v) => toggleActive(s, v)} disabled={s.is_demo} /></TableCell>
                  <TableCell><RobotsBadge value={s.is_demo ? null : s.robots_allowed} /></TableCell>
                  <TableCell><div className="flex items-center gap-2"><Progress value={s.trust_level} className="h-2" /><span className="text-xs text-muted-foreground w-8">{s.trust_level}</span></div></TableCell>
                  <TableCell>
                    {s.is_demo ? <span className="text-xs text-slate-400">—</span> : (
                      <Select value={String(Number(s.config?.schedule_minutes) || 0)} onValueChange={(v) => setSchedule(s, v)}>
                        <SelectTrigger className="h-8 w-[130px] text-xs" data-testid={`schedule-${s.id}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{SCHEDULES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{fmt(s.last_crawled_at) || <span className="italic text-slate-400">Never</span>}</TableCell>
                  <TableCell className="text-right">
                    {!s.is_demo && (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" disabled={running === s.id || !s.is_active} onClick={() => run(s)} data-testid={`run-${s.id}`}>
                          {running === s.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}Run ingestion
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" data-testid={`menu-${s.id}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel className="text-xs text-muted-foreground">{s.name}</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => toggleDetails(s)}><FileSearch className="h-4 w-4 mr-2" />{s.config?.fetch_details ? 'Disable detail fetch' : 'Enable detail fetch'}</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setConfirm({ source: s, mode: 'purge' })}><Eraser className="h-4 w-4 mr-2" />Purge ingested data</DropdownMenuItem>
                            <DropdownMenuItem className="text-rose-600 focus:text-rose-600" onClick={() => setConfirm({ source: s, mode: 'delete' })}><Trash2 className="h-4 w-4 mr-2" />Delete source & data</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.mode === 'delete' ? 'Delete this source and all its data?' : 'Purge all ingested data for this source?'}</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes every lead, evidence record, retrieval, pipeline log and run produced from <span className="font-medium">{confirm?.source?.name}</span>
              {confirm?.mode === 'delete' ? ', and then removes the source itself.' : '. The source stays in the registry so you can run it again.'} Saved leads pointing at these leads are removed too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyConfirm}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); doConfirm() }} disabled={busyConfirm} className="bg-rose-600 hover:bg-rose-700" data-testid="confirm-purge">
              {busyConfirm && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{confirm?.mode === 'delete' ? 'Delete source' : 'Purge data'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

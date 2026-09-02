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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Database, Info, Plus, Play, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const TYPES = [
  ['government_tender', 'Government Tender'], ['municipal_portal', 'Municipal Portal'], ['permit_database', 'Permit Database'],
  ['procurement_portal', 'Procurement Portal'], ['rss_feed', 'RSS Feed'], ['news', 'News'], ['company_site', 'Company Site'], ['other', 'Other'],
]
const TYPE_LABEL = Object.fromEntries(TYPES)

export default function SourcesView({ onRan }) {
  const [sources, setSources] = useState(null)
  const [running, setRunning] = useState(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', domain: '', base_url: '', source_type: 'rss_feed', trust_level: 60, is_active: true, robots_allowed: true, terms_ok: true })

  const load = async () => { try { setSources(await api('sources')) } catch (e) { toast.error(e.message); setSources([]) } }
  useEffect(() => { load() }, [])

  const addSource = async () => {
    if (!form.name || !form.domain || !form.base_url) { toast.error('Name, domain and source URL are required'); return }
    setSaving(true)
    try { await api('sources', { method: 'POST', body: { ...form, trust_level: Number(form.trust_level) } }); toast.success('Source added'); setOpen(false)
      setForm({ name: '', domain: '', base_url: '', source_type: 'rss_feed', trust_level: 60, is_active: true, robots_allowed: true, terms_ok: true }); load() }
    catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const run = async (s) => {
    setRunning(s.id)
    try {
      const r = await api('admin/run-pipeline', { method: 'POST', body: { source_id: s.id } })
      if (r.status === 'failed') toast.error(`Run failed — retrieval could not complete. No leads created.`)
      else toast.success(`Run ${r.status}: ${r.found} created · ${r.verified} verified · ${r.rejected} rejected · ${r.duplicated} duplicate`)
      onRan && onRan()
    } catch (e) { toast.error(e.message) } finally { setRunning(null); load() }
  }

  const toggleActive = async (s, v) => {
    setSources((p) => p.map((x) => x.id === s.id ? { ...x, is_active: v } : x))
    try { await api(`sources/${s.id}`, { method: 'PATCH', body: { is_active: v } }) } catch (e) { toast.error(e.message); load() }
  }

  const fmt = (d) => d ? new Date(d).toLocaleDateString() : null

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div><h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
          <p className="text-muted-foreground">Registry of approved public sources. Every real lead must originate here.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-amber-500 hover:bg-amber-600 text-slate-900"><Plus className="h-4 w-4 mr-2" />Add source</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Approve a new source</DialogTitle>
              <DialogDescription>Add a real, publicly accessible source (an RSS/Atom feed works best). You confirm it is legal to retrieve.</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="City of X – Bids" /></div>
                <div className="space-y-1"><Label>Domain</Label><Input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="bids.cityofx.gov" /></div>
              </div>
              <div className="space-y-1"><Label>Source URL (feed or page)</Label><Input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="https://…/rss" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Type</Label>
                  <Select value={form.source_type} onValueChange={(v) => setForm({ ...form, source_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Reliability (0–100)</Label><Input type="number" min="0" max="100" value={form.trust_level} onChange={(e) => setForm({ ...form, trust_level: e.target.value })} /></div>
              </div>
              <div className="flex flex-wrap gap-6 pt-1">
                <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />Active</label>
                <label className="flex items-center gap-2 text-sm"><Switch checked={form.robots_allowed} onCheckedChange={(v) => setForm({ ...form, robots_allowed: v })} />robots.txt OK</label>
                <label className="flex items-center gap-2 text-sm"><Switch checked={form.terms_ok} onCheckedChange={(v) => setForm({ ...form, terms_ok: v })} />Terms OK</label>
              </div>
            </div>
            <DialogFooter><Button onClick={addSource} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-slate-900">{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Add source</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Alert className="border-slate-300 bg-slate-50">
        <Info className="h-4 w-4" />
        <AlertDescription>Add one approved source and click <span className="font-medium">Run ingestion</span> to execute the verification pipeline (SOURCE → RETRIEVE → EXTRACT → EVIDENCE → VALIDATE → LEAD). Watch results in <span className="font-medium">Admin / Debug</span>. Nothing is fabricated — unsupported fields stay empty.</AlertDescription>
      </Alert>

      {!sources && <Skeleton className="h-40 w-full" />}
      {sources && sources.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground"><Database className="h-8 w-8 mx-auto mb-2 opacity-40" />No sources yet. Add your first approved source.</CardContent></Card>}

      {sources && sources.length > 0 && (
        <Card><CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Source name</TableHead><TableHead>Domain</TableHead><TableHead>Type</TableHead>
              <TableHead>Active</TableHead><TableHead className="w-36">Reliability</TableHead><TableHead>Last checked</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {sources.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium"><div className="flex items-center gap-2">{s.name}{s.is_demo && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">DEMO</Badge>}</div></TableCell>
                  <TableCell className="text-muted-foreground">{s.domain}</TableCell>
                  <TableCell>{TYPE_LABEL[s.source_type] || s.source_type}</TableCell>
                  <TableCell><Switch checked={!!s.is_active} onCheckedChange={(v) => toggleActive(s, v)} disabled={s.is_demo} /></TableCell>
                  <TableCell><div className="flex items-center gap-2"><Progress value={s.trust_level} className="h-2" /><span className="text-xs text-muted-foreground w-8">{s.trust_level}</span></div></TableCell>
                  <TableCell className="text-muted-foreground">{fmt(s.last_crawled_at) || <span className="italic text-slate-400">Never</span>}</TableCell>
                  <TableCell>
                    {!s.is_demo && (
                      <Button size="sm" variant="outline" disabled={running === s.id || !s.is_active} onClick={() => run(s)}>
                        {running === s.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}Run ingestion
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/tradescout/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Terminal, ArrowLeft, CheckCircle2, XCircle, SkipForward, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

const RUN_STATUS = {
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  failed: 'bg-rose-100 text-rose-700 border-rose-200',
  running: 'bg-blue-100 text-blue-700 border-blue-200',
  queued: 'bg-slate-100 text-slate-600 border-slate-200',
}
const STEP_ICON = { ok: CheckCircle2, fail: XCircle, skip: SkipForward }
const STEP_COLOR = { ok: 'text-emerald-600', fail: 'text-rose-600', skip: 'text-amber-600' }

export default function AdminView() {
  const [runs, setRuns] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const load = async () => { try { setRuns(await api('admin/runs')) } catch (e) { toast.error(e.message); setRuns([]) } }
  useEffect(() => { load() }, [])

  const openRun = async (id) => {
    setLoadingDetail(true)
    try { setDetail(await api(`admin/runs/${id}`)) } catch (e) { toast.error(e.message) } finally { setLoadingDetail(false) }
  }

  const fmt = (d) => d ? new Date(d).toLocaleString() : '—'

  if (detail || loadingDetail) {
    const d = detail
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => { setDetail(null) }}><ArrowLeft className="h-4 w-4 mr-1" />Back to runs</Button>
        {loadingDetail || !d ? <Skeleton className="h-64 w-full" /> : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">Run {d.id.slice(0, 8)}</h1>
              <Badge variant="outline" className={RUN_STATUS[d.status]}>{d.status}</Badge>
              <span className="text-sm text-muted-foreground">{d.connector} · {d.params?.source_name || '—'}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[['Produced', d.leads_found, 'text-slate-900'], ['Verified', d.leads_verified, 'text-emerald-600'], ['Rejected', d.leads_rejected, 'text-rose-600'], ['Duplicated', d.leads_duplicated, 'text-amber-600']].map(([l, v, c]) => (
                <Card key={l}><CardContent className="pt-5"><p className="text-xs text-muted-foreground">{l}</p><p className={`text-2xl font-semibold ${c}`}>{v ?? 0}</p></CardContent></Card>
              ))}
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Retrieval</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {d.retrievals.length === 0 && <p className="text-sm text-muted-foreground">No retrieval recorded.</p>}
                {d.retrievals.map((r) => (
                  <div key={r.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between"><span className="font-medium break-all">{r.source_title || r.source_url}</span>
                      <Badge variant="outline" className={r.retrieval_status === 'success' ? RUN_STATUS.completed : RUN_STATUS.failed}>{r.retrieval_status}</Badge></div>
                    <p className="text-xs text-muted-foreground mt-1">HTTP {r.http_status ?? '—'} · {r.byte_size ?? 0} bytes · {r.source_domain}</p>
                    {r.error && <p className="text-xs text-rose-600 mt-1">{r.error}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1 font-mono break-all">hash: {r.content_hash?.slice(0, 24)}…</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Pipeline log ({d.logs.length} steps)</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-[420px] overflow-y-auto">
                  {d.logs.map((l) => {
                    const Icon = STEP_ICON[l.status] || CheckCircle2
                    return (
                      <div key={l.id} className="flex items-start gap-2 text-sm py-1 border-b last:border-0">
                        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${STEP_COLOR[l.status] || 'text-slate-500'}`} />
                        <Badge variant="outline" className="text-[10px] uppercase shrink-0 w-20 justify-center">{l.step}</Badge>
                        <span className="text-slate-700">{l.message}</span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {d.leads.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Leads produced ({d.leads.length})</CardTitle></CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Trade</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {d.leads.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium max-w-md truncate">{l.project_name}</TableCell>
                          <TableCell>{l.trade_category || <span className="italic text-slate-400">n/a</span>}</TableCell>
                          <TableCell>{l.location || <span className="italic text-slate-400">n/a</span>}</TableCell>
                          <TableCell><Badge variant="outline" className={l.verification_status === 'verified' ? RUN_STATUS.completed : 'bg-amber-100 text-amber-700 border-amber-200'}>{l.verification_status.replace('_', ' ')}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Terminal className="h-5 w-5" />Admin / Debug</h1>
          <p className="text-muted-foreground">Internal view of ingestion runs, retrieval &amp; validation status, and errors.</p></div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
      </div>

      <Alert className="border-slate-300 bg-slate-50"><Terminal className="h-4 w-4" />
        <AlertDescription>This is a technical debugging view. Run a source from the <span className="font-medium">Sources</span> page to populate runs.</AlertDescription></Alert>

      {!runs && <Skeleton className="h-40 w-full" />}
      {runs && runs.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground">No pipeline runs yet.</CardContent></Card>}

      {runs && runs.length > 0 && (
        <Card><CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>When</TableHead><TableHead>Source</TableHead><TableHead>Connector</TableHead><TableHead>Status</TableHead>
              <TableHead>Produced</TableHead><TableHead>Verified</TableHead><TableHead>Rejected</TableHead><TableHead>Duplicated</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => openRun(r.id)}>
                  <TableCell className="whitespace-nowrap text-sm">{fmt(r.created_at)}</TableCell>
                  <TableCell className="max-w-[180px] truncate">{r.params?.source_name || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{r.connector || '—'}</TableCell>
                  <TableCell><Badge variant="outline" className={RUN_STATUS[r.status] || ''}>{r.status}</Badge></TableCell>
                  <TableCell>{r.leads_found ?? 0}</TableCell>
                  <TableCell className="text-emerald-600 font-medium">{r.leads_verified ?? 0}</TableCell>
                  <TableCell className="text-rose-600">{r.leads_rejected ?? 0}</TableCell>
                  <TableCell className="text-amber-600">{r.leads_duplicated ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </div>
  )
}

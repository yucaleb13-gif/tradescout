'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/tradescout/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { tradeLabel, money, UNAVAILABLE, VERIFICATION_STYLES, LEAD_STATUSES } from '@/lib/tradescout/constants'
import { ArrowLeft, Bookmark, BookmarkCheck, ExternalLink, ShieldCheck, FileText, Building2, MapPin, Calendar, Hash } from 'lucide-react'
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

export default function LeadDetail({ id, onBack }) {
  const [lead, setLead] = useState(null)
  const [saved, setSaved] = useState(null)

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
              <div><p className="text-xs text-muted-foreground flex items-center gap-1">Estimated trade opportunity <Badge variant="outline" className="text-[10px]">estimate</Badge></p>
                <p className={est ? 'text-lg font-semibold text-amber-700' : 'text-sm italic text-slate-400'}>{est || UNAVAILABLE}</p>
                {lead.estimation_method && <p className="text-[11px] text-muted-foreground mt-1">Method: {lead.estimation_method.replace(/_/g, ' ')}{lead.estimation_confidence != null ? ` · confidence ${Math.round(lead.estimation_confidence * 100)}%` : ''}</p>}</div>
              <Separator />
              <div><p className="text-xs text-muted-foreground">Lead score</p><p className="text-lg font-semibold">{lead.lead_score ?? UNAVAILABLE}</p></div>
            </CardContent>
          </Card>

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

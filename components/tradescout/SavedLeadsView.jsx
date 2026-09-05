'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/tradescout/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { tradeLabel, money, LEAD_STATUSES, STATUS_STYLES, SCORE_CATEGORY_STYLES, SCORE_CATEGORY_LABELS, scoreCategoryOf } from '@/lib/tradescout/constants'
import { Trash2, StickyNote, Bookmark, List, Columns } from 'lucide-react'
import { toast } from 'sonner'

const ScoreBadge = ({ lead, className = '' }) => {
  if (!lead || lead.lead_score == null) return null
  const c = lead.score_category || scoreCategoryOf(lead.lead_score)
  return (
    <Badge variant="outline" className={`${SCORE_CATEGORY_STYLES[c] || ''} ${className}`}>
      {lead.lead_score}/100 · {SCORE_CATEGORY_LABELS[c] || 'Unscored'}
    </Badge>
  )
}

export default function SavedLeadsView({ onOpenLead }) {
  const [items, setItems] = useState(null)
  const [noteFor, setNoteFor] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [view, setView] = useState('list')

  const load = async () => { try { setItems(await api('saved-leads')) } catch (e) { toast.error(e.message); setItems([]) } }
  useEffect(() => { load() }, [])

  const setStatus = async (row, status) => {
    setItems((p) => p.map((x) => x.id === row.id ? { ...x, status } : x))
    try { await api(`saved-leads/${row.id}`, { method: 'PATCH', body: { status } }) }
    catch (e) { toast.error(e.message); load() }
  }
  const remove = async (row) => {
    try { await api(`saved-leads/${row.id}`, { method: 'DELETE' }); setItems((p) => p.filter((x) => x.id !== row.id)); toast.success('Removed') }
    catch (e) { toast.error(e.message) }
  }
  const saveNote = async () => {
    try { await api(`saved-leads/${noteFor.id}`, { method: 'PATCH', body: { notes: noteText } })
      setItems((p) => p.map((x) => x.id === noteFor.id ? { ...x, notes: noteText } : x)); setNoteFor(null); toast.success('Note saved') }
    catch (e) { toast.error(e.message) }
  }

  const Toolbar = () => (
    <div className="flex items-center justify-between">
      <div><h1 className="text-2xl font-semibold tracking-tight">Saved Leads</h1>
        <p className="text-muted-foreground">Track opportunities through your pipeline.</p></div>
      <div className="flex gap-1">
        <Button size="sm" variant={view === 'list' ? 'default' : 'outline'} onClick={() => setView('list')}><List className="h-4 w-4 mr-1" />List</Button>
        <Button size="sm" variant={view === 'board' ? 'default' : 'outline'} onClick={() => setView('board')}><Columns className="h-4 w-4 mr-1" />Board</Button>
      </div>
    </div>
  )

  const NoteDialog = ({ row }) => (
    <Dialog open={noteFor?.id === row.id} onOpenChange={(o) => { if (o) { setNoteFor(row); setNoteText(row.notes || '') } else setNoteFor(null) }}>
      <DialogTrigger asChild><Button size="icon" variant="outline" className="h-9 w-9"><StickyNote className="h-4 w-4" /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Note</DialogTitle></DialogHeader>
        <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={5} placeholder="Add a private note about this lead…" />
        <DialogFooter><Button onClick={saveNote} className="bg-amber-500 hover:bg-amber-600 text-slate-900">Save note</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const empty = items && items.length === 0

  return (
    <div className="space-y-6">
      <Toolbar />

      {!items && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>}
      {empty && <Card><CardContent className="py-12 text-center text-muted-foreground"><Bookmark className="h-8 w-8 mx-auto mb-2 opacity-40" />No saved leads yet. Save leads from Discover.</CardContent></Card>}

      {items && !empty && view === 'list' && (
        <div className="grid gap-4">
          {items.map((row) => {
            const l = row.lead || {}
            return (
              <Card key={row.id}>
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <button className="flex-1 text-left min-w-0" onClick={() => onOpenLead(l.id)}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{l.project_name || 'Untitled project'}</span>
                        {l.is_demo && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">DEMO</Badge>}
                        <ScoreBadge lead={l} className="text-[10px]" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{tradeLabel(l.trade_category) || '—'} · {l.location || 'Location N/A'} · {money(l.estimated_trade_value, l.estimated_trade_value_currency) || 'value N/A'}</p>
                      {row.notes && <p className="text-xs text-slate-500 mt-1 line-clamp-1"><StickyNote className="h-3 w-3 inline mr-1" />{row.notes}</p>}
                    </button>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={STATUS_STYLES[row.status] || ''}>{row.status}</Badge>
                      <Select value={row.status} onValueChange={(v) => setStatus(row, v)}>
                        <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>{LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                      <NoteDialog row={row} />
                      <Button size="icon" variant="outline" className="h-9 w-9 text-rose-600" onClick={() => remove(row)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {items && !empty && view === 'board' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {LEAD_STATUSES.map((status) => {
            const col = items.filter((x) => x.status === status)
            return (
              <div key={status} className="w-72 shrink-0">
                <div className="flex items-center justify-between mb-2 px-1">
                  <Badge variant="outline" className={STATUS_STYLES[status]}>{status}</Badge>
                  <span className="text-xs text-muted-foreground">{col.length}</span>
                </div>
                <div className="space-y-2 min-h-[80px] rounded-lg bg-slate-100/60 p-2">
                  {col.map((row) => {
                    const l = row.lead || {}
                    return (
                      <Card key={row.id} className="shadow-sm">
                        <CardContent className="p-3 space-y-2">
                          <button className="text-left w-full" onClick={() => onOpenLead(l.id)}>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium leading-tight line-clamp-2">{l.project_name || 'Untitled project'}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1">{tradeLabel(l.trade_category) || '—'} · {money(l.estimated_trade_value, l.estimated_trade_value_currency) || 'value N/A'}</p>
                            <div className="flex items-center gap-1 mt-1">
                              <ScoreBadge lead={l} className="text-[9px]" />
                              {l.is_demo && <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-700">DEMO</Badge>}
                            </div>
                          </button>
                          <div className="flex items-center gap-1 pt-1 border-t">
                            <Select value={row.status} onValueChange={(v) => setStatus(row, v)}>
                              <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                              <SelectContent>{LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600" onClick={() => remove(row)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                  {col.length === 0 && <p className="text-[11px] text-slate-400 text-center py-4">No leads</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

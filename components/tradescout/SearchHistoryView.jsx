'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/tradescout/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { tradeLabel } from '@/lib/tradescout/constants'
import { History, Trash2, MapPin } from 'lucide-react'
import { toast } from 'sonner'

export default function SearchHistoryView() {
  const [items, setItems] = useState(null)
  const load = async () => { try { setItems(await api('search-history')) } catch (e) { toast.error(e.message); setItems([]) } }
  useEffect(() => { load() }, [])

  const remove = async (id) => {
    try { await api(`search-history/${id}`, { method: 'DELETE' }); setItems((p) => p.filter((x) => x.id !== id)) }
    catch (e) { toast.error(e.message) }
  }

  const fmt = (d) => new Date(d).toLocaleString()

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold tracking-tight">Search History</h1>
        <p className="text-muted-foreground">Your saved opportunity searches.</p></div>

      {!items && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>}
      {items && items.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground"><History className="h-8 w-8 mx-auto mb-2 opacity-40" />No searches yet. Run a search from Discover.</CardContent></Card>}

      <div className="grid gap-3">
        {items?.map((h) => {
          const f = h.filters || {}
          return (
            <Card key={h.id}><CardContent className="pt-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">{h.query_text || 'All opportunities'}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {f.trade && <Badge variant="outline">{tradeLabel(f.trade)}</Badge>}
                    {f.location && <Badge variant="outline"><MapPin className="h-3 w-3 mr-1" />{f.location}{f.radius_miles ? ` · ${f.radius_miles}mi` : ''}</Badge>}
                    {f.project_type && <Badge variant="outline">{f.project_type}</Badge>}
                    {f.min_opportunity_value && <Badge variant="outline">min ${Number(f.min_opportunity_value).toLocaleString()}</Badge>}
                    {(f.date_from || f.date_to) && <Badge variant="outline">{f.date_from || '…'} → {f.date_to || '…'}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{fmt(h.created_at)} · {h.result_count} results</p>
                </div>
                <Button size="icon" variant="ghost" className="text-rose-600 shrink-0" onClick={() => remove(h.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardContent></Card>
          )
        })}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/tradescout/api'
import { DemoBanner } from './DemoBanner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { tradeLabel, money } from '@/lib/tradescout/constants'
import { Layers, Bookmark, TrendingUp, Sparkles, ArrowRight } from 'lucide-react'

const STAT_CARDS = [
  { key: 'available_leads', label: 'Available Leads', icon: Layers, color: 'text-blue-600 bg-blue-50' },
  { key: 'saved_leads', label: 'Saved Leads', icon: Bookmark, color: 'text-amber-600 bg-amber-50' },
  { key: 'high_opportunity', label: 'High Opportunity Leads', icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
  { key: 'new_this_week', label: 'New This Week', icon: Sparkles, color: 'text-violet-600 bg-violet-50' },
]

export default function DashboardView({ profile, onNavigate, onOpenLead }) {
  const [stats, setStats] = useState(null)
  const [leads, setLeads] = useState(null)

  useEffect(() => {
    api('stats').then(setStats).catch(() => setStats({}))
    api('leads').then((d) => setLeads(d.slice(0, 5))).catch(() => setLeads([]))
  }, [])

  const name = profile?.full_name?.split(' ')[0] || 'there'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {name}</h1>
        <p className="text-muted-foreground">Your construction opportunity workspace.</p>
      </div>

      <DemoBanner />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map(({ key, label, icon: Icon, color }) => (
          <Card key={key}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  {stats ? <p className="text-3xl font-semibold mt-1">{stats[key] ?? 0}</p> : <Skeleton className="h-9 w-12 mt-1" />}
                </div>
                <div className={`h-10 w-10 rounded-lg grid place-items-center ${color}`}><Icon className="h-5 w-5" /></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground -mt-2">Statistics reflect actual records in your workspace (including DEMO samples). No numbers are simulated.</p>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent available leads</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => onNavigate('discover')}>Discover <ArrowRight className="h-4 w-4 ml-1" /></Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {!leads && [0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
          {leads && leads.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No leads in your workspace yet.</p>}
          {leads && leads.map((l) => (
            <button key={l.id} onClick={() => onOpenLead(l.id)}
              className="w-full flex items-center justify-between rounded-lg border p-3 hover:bg-slate-50 text-left">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{l.project_name || 'Untitled project'}</span>
                  {l.is_demo && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">DEMO</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{tradeLabel(l.trade_category) || '—'} · {l.location || 'Location N/A'}</p>
              </div>
              <div className="text-right shrink-0 pl-3">
                <p className="text-sm font-medium">{money(l.estimated_trade_value, l.estimated_trade_value_currency) || '—'}</p>
                <p className="text-[10px] text-muted-foreground">est. trade value</p>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

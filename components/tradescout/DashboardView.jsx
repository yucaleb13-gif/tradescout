'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/tradescout/api'
import { DemoBanner } from './DemoBanner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { tradeLabel, money, TRADES, SCORE_CATEGORY_LABELS, scoreCategoryOf } from '@/lib/tradescout/constants'
import { Layers, Bookmark, TrendingUp, Sparkles, ArrowRight, CheckCircle2, Circle, Gauge } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'

const SCORE_CAT_ORDER = ['high', 'good', 'moderate', 'low']
const SCORE_CAT_COLOR = { high: '#10b981', good: '#3b82f6', moderate: '#f59e0b', low: '#94a3b8' }

const STAT_CARDS = [
  { key: 'available_leads', label: 'Available Leads', icon: Layers, color: 'text-blue-600 bg-blue-50' },
  { key: 'saved_leads', label: 'Saved Leads', icon: Bookmark, color: 'text-amber-600 bg-amber-50' },
  { key: 'high_opportunity', label: 'High Opportunity Leads', icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
  { key: 'new_this_week', label: 'New This Week', icon: Sparkles, color: 'text-violet-600 bg-violet-50' },
]

export default function DashboardView({ profile, onNavigate, onOpenLead }) {
  const [stats, setStats] = useState(null)
  const [leads, setLeads] = useState(null)
  const [allLeads, setAllLeads] = useState([])
  const [historyCount, setHistoryCount] = useState(null)

  useEffect(() => {
    api('stats').then(setStats).catch(() => setStats({}))
    api('leads').then((d) => { setAllLeads(d); setLeads(d.slice(0, 5)) }).catch(() => { setAllLeads([]); setLeads([]) })
    api('search-history').then((d) => setHistoryCount(d.length)).catch(() => setHistoryCount(0))
  }, [])

  const name = profile?.full_name?.split(' ')[0] || 'there'

  const breakdown = TRADES.map((t) => ({ name: t.label, value: allLeads.filter((l) => l.trade_category === t.value).length }))
    .filter((d) => d.value > 0).sort((a, b) => b.value - a.value)

  const scoreCounts = allLeads.reduce((acc, l) => {
    const c = l.score_category || scoreCategoryOf(l.lead_score)
    if (c) acc[c] = (acc[c] || 0) + 1
    return acc
  }, {})
  const scoreBreakdown = SCORE_CAT_ORDER.map((c) => ({ key: c, name: SCORE_CATEGORY_LABELS[c], value: scoreCounts[c] || 0, color: SCORE_CAT_COLOR[c] }))
  const scoreTotal = scoreBreakdown.reduce((a, d) => a + d.value, 0)

  const onboarding = [
    { done: (profile?.trade_focus?.length || 0) > 0, label: 'Set your trade focus', action: () => onNavigate('settings') },
    { done: (stats?.saved_leads || 0) > 0, label: 'Save your first lead', action: () => onNavigate('discover') },
    { done: (historyCount || 0) > 0, label: 'Run your first search', action: () => onNavigate('discover') },
  ]
  const onboardDone = onboarding.filter((o) => o.done).length
  const showOnboarding = stats && historyCount !== null && onboarding.some((o) => !o.done)

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

      {showOnboarding && (
        <Card className="border-amber-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Get started</CardTitle>
            <span className="text-xs text-muted-foreground">{onboardDone}/{onboarding.length} complete</span>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={(onboardDone / onboarding.length) * 100} className="h-2" />
            {onboarding.map((o, i) => (
              <button key={i} onClick={o.action} className="w-full flex items-center gap-3 text-left text-sm rounded-md p-2 hover:bg-slate-50">
                {o.done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-300" />}
                <span className={o.done ? 'line-through text-muted-foreground' : ''}>{o.label}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card data-testid="opportunity-breakdown">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4" /> Opportunity score breakdown</CardTitle>
          <button onClick={() => onNavigate('discover')} className="text-xs text-muted-foreground hover:text-foreground">View leads</button>
        </CardHeader>
        <CardContent>
          {!leads && <Skeleton className="h-40 w-full" />}
          {leads && scoreTotal === 0 && <p className="text-sm text-muted-foreground py-12 text-center">No scored leads yet.</p>}
          {leads && scoreTotal > 0 && (
            <div className="grid gap-6 sm:grid-cols-5 items-center">
              <div className="sm:col-span-3">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={scoreBreakdown} layout="vertical" margin={{ left: 10, right: 24 }}>
                    <XAxis type="number" allowDecimals={false} hide />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(v) => [`${v} lead${v === 1 ? '' : 's'}`, 'Count']} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 12 }}>
                      {scoreBreakdown.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="sm:col-span-2 space-y-2">
                {scoreBreakdown.map((d) => (
                  <div key={d.key} className="flex items-center justify-between rounded-md border p-2.5">
                    <span className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />{d.name}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{d.value}<span className="text-muted-foreground font-normal"> · {Math.round((d.value / scoreTotal) * 100)}%</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Available leads by trade</CardTitle></CardHeader>
          <CardContent>
            {!leads && <Skeleton className="h-56 w-full" />}
            {leads && breakdown.length === 0 && <p className="text-sm text-muted-foreground py-16 text-center">No leads to chart yet.</p>}
            {leads && breakdown.length > 0 && (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={breakdown} layout="vertical" margin={{ left: 10, right: 16 }}>
                  <XAxis type="number" allowDecimals={false} hide />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {breakdown.map((_, i) => <Cell key={i} fill="#f59e0b" />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

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
    </div>
  )
}

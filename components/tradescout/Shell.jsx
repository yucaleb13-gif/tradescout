'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/tradescout/api'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { HardHat, LayoutDashboard, Search, Bookmark, History, Database, Settings, Menu, LogOut, Terminal, Bell, Gauge } from 'lucide-react'
import { SCORE_CATEGORY_STYLES, tradeLabel } from '@/lib/tradescout/constants'
import DashboardView from './DashboardView'
import DiscoverView from './DiscoverView'
import SavedLeadsView from './SavedLeadsView'
import SearchHistoryView from './SearchHistoryView'
import SourcesView from './SourcesView'
import SettingsView from './SettingsView'
import LeadDetail from './LeadDetail'
import AdminView from './AdminView'

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'discover', label: 'Discover Leads', icon: Search },
  { key: 'saved', label: 'Saved Leads', icon: Bookmark },
  { key: 'history', label: 'Search History', icon: History },
  { key: 'sources', label: 'Sources', icon: Database },
  { key: 'admin', label: 'Admin / Debug', icon: Terminal },
  { key: 'settings', label: 'Settings', icon: Settings },
]

const SEEN_KEY = 'ts_alerts_seen_at'

function timeAgo(iso) {
  const d = new Date(iso); const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return d.toLocaleDateString()
}

function NotificationsBell({ onOpenLead }) {
  const [alerts, setAlerts] = useState(null)
  const [open, setOpen] = useState(false)
  const [seenAt, setSeenAt] = useState('1970-01-01T00:00:00.000Z')

  useEffect(() => {
    const s = typeof window !== 'undefined' ? localStorage.getItem(SEEN_KEY) : null
    if (s) setSeenAt(s)
    const load = async () => { try { setAlerts(await api('alerts')) } catch { setAlerts([]) } }
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [])

  const list = alerts || []
  const unread = list.filter((a) => new Date(a.created_at) > new Date(seenAt)).length

  const onOpenChange = (o) => {
    setOpen(o)
    if (o) { const now = new Date().toISOString(); try { localStorage.setItem(SEEN_KEY, now) } catch {} setSeenAt(now) }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button className="relative rounded-full p-2 hover:bg-slate-100 transition" data-testid="alerts-bell" aria-label="High-opportunity alerts">
          <Bell className="h-5 w-5 text-slate-600" />
          {unread > 0 && (
            <span data-testid="alerts-badge" className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-rose-500 text-white text-[10px] font-semibold">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" data-testid="alerts-panel">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Gauge className="h-4 w-4 text-emerald-600" />
          <p className="text-sm font-medium">High-opportunity leads</p>
          <span className="ml-auto text-xs text-muted-foreground">{list.length}</span>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {alerts === null && <p className="px-4 py-6 text-sm text-muted-foreground text-center">Loading…</p>}
          {alerts && list.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground text-center">No high-opportunity leads yet.</p>}
          {list.map((a) => {
            const isNew = new Date(a.created_at) > new Date(seenAt)
            return (
              <button key={a.id} onClick={() => { setOpen(false); onOpenLead(a.id) }}
                className="w-full text-left px-4 py-3 border-b last:border-0 hover:bg-slate-50 transition flex gap-3">
                {isNew && <span className="mt-1.5 h-2 w-2 rounded-full bg-rose-500 shrink-0" />}
                <span className={`flex-1 min-w-0 ${isNew ? '' : 'pl-5'}`}>
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{a.project_name || 'Untitled project'}</span>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${SCORE_CATEGORY_STYLES.high}`}>{a.lead_score}/100</Badge>
                  </span>
                  <span className="block text-[11px] text-muted-foreground truncate">{tradeLabel(a.trade_category) || '—'} · {a.location || 'Location N/A'} · {timeAgo(a.created_at)}</span>
                </span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function Shell({ auth, refreshAuth }) {
  const [view, setView] = useState('dashboard')
  const [lead, setLead] = useState(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const profile = auth?.profile

  const go = (v) => { setLead(null); setView(v); setMobileOpen(false) }
  const openLead = (id) => setLead(id)
  const logout = async () => { await api('auth/logout', { method: 'POST' }).catch(() => {}); await refreshAuth() }

  const initials = (profile?.full_name || profile?.email || 'U').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()
  const title = lead ? 'Lead detail' : (NAV.find((n) => n.key === view)?.label || '')

  const NavList = () => (
    <nav className="space-y-1">
      {NAV.map(({ key, label, icon: Icon }) => (
        <button key={key} onClick={() => go(key)}
          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${view === key && !lead ? 'bg-amber-500 text-slate-900 font-medium' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
          <Icon className="h-4 w-4" />{label}
        </button>
      ))}
    </nav>
  )

  const Brand = () => (
    <div className="flex items-center gap-2 px-3 py-4">
      <div className="h-9 w-9 rounded-lg bg-amber-500 grid place-items-center"><HardHat className="h-5 w-5 text-slate-900" /></div>
      <div><p className="text-white font-semibold leading-tight">TradeScout</p><p className="text-[10px] text-slate-400">Opportunity discovery</p></div>
    </div>
  )

  const renderView = () => {
    if (lead) return <LeadDetail id={lead} onBack={() => setLead(null)} />
    switch (view) {
      case 'dashboard': return <DashboardView profile={profile} onNavigate={go} onOpenLead={openLead} />
      case 'discover': return <DiscoverView onOpenLead={openLead} />
      case 'saved': return <SavedLeadsView onOpenLead={openLead} />
      case 'history': return <SearchHistoryView />
      case 'sources': return <SourcesView />
      case 'admin': return <AdminView />
      case 'settings': return <SettingsView profile={profile} onUpdated={refreshAuth} />
      default: return null
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 flex-col bg-slate-900 border-r border-slate-800 fixed inset-y-0">
        <Brand />
        <div className="px-3 flex-1"><NavList /></div>
        <div className="p-3 text-[10px] text-slate-500">Live discovery · approved sources only · nothing fabricated</div>
      </aside>

      <div className="flex-1 md:pl-64 flex flex-col min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b h-14 flex items-center gap-3 px-4 md:px-8">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild><Button variant="ghost" size="icon" className="md:hidden"><Menu className="h-5 w-5" /></Button></SheetTrigger>
            <SheetContent side="left" className="bg-slate-900 border-slate-800 p-0 w-64">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <Brand /><div className="px-3"><NavList /></div>
            </SheetContent>
          </Sheet>
          <h1 className="font-semibold">{title}</h1>
          <div className="ml-auto flex items-center gap-1">
            <NotificationsBell onOpenLead={openLead} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2"><Avatar className="h-8 w-8"><AvatarFallback className="bg-slate-900 text-white text-xs">{initials}</AvatarFallback></Avatar></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <p className="text-sm font-medium">{profile?.full_name || 'Account'}</p>
                  <p className="text-xs text-muted-foreground font-normal">{profile?.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => go('settings')}><Settings className="h-4 w-4 mr-2" />Settings</DropdownMenuItem>
                <DropdownMenuItem onClick={logout} className="text-rose-600"><LogOut className="h-4 w-4 mr-2" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">{renderView()}</main>
      </div>
    </div>
  )
}

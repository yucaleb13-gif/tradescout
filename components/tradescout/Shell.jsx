'use client'

import { useState } from 'react'
import { api } from '@/lib/tradescout/api'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { HardHat, LayoutDashboard, Search, Bookmark, History, Database, Settings, Menu, LogOut, Terminal } from 'lucide-react'
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
        <div className="p-3 text-[10px] text-slate-500">Foundation build · live discovery not connected</div>
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
          <div className="ml-auto">
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

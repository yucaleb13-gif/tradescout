'use client'

import { useState, useEffect, useCallback } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { api } from '@/lib/tradescout/api'
import AuthScreen from '@/components/tradescout/AuthScreen'
import Shell from '@/components/tradescout/Shell'
import { HardHat } from 'lucide-react'

function App() {
  const [booting, setBooting] = useState(true)
  const [auth, setAuth] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const me = await api('auth/me')
      setAuth(me?.authenticated ? me : null)
    } catch { setAuth(null) }
  }, [])

  useEffect(() => { (async () => { await refresh(); setBooting(false) })() }, [refresh])

  if (booting) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="h-10 w-10 rounded-lg bg-amber-500 grid place-items-center animate-pulse"><HardHat className="h-5 w-5 text-slate-900" /></div>
          <span className="text-sm">Loading TradeScout…</span>
        </div>
      </div>
    )
  }

  return (
    <>
      {auth ? <Shell auth={auth} refreshAuth={refresh} /> : <AuthScreen onAuthed={refresh} />}
      <Toaster richColors position="top-right" />
    </>
  )
}

export default App

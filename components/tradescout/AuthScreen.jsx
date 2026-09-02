'use client'

import { useState } from 'react'
import { api } from '@/lib/tradescout/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { HardHat, ShieldCheck, Building2, FileSearch, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function AuthScreen({ onAuthed }) {
  const [tab, setTab] = useState('login')
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)

  const [login, setLogin] = useState({ email: '', password: '' })
  const [signup, setSignup] = useState({ email: '', password: '', fullName: '', companyName: '' })
  const [resetEmail, setResetEmail] = useState('')

  const doLogin = async (e) => {
    e.preventDefault(); setLoading(true)
    try { await api('auth/login', { method: 'POST', body: login }); await onAuthed() }
    catch (err) { toast.error(err.message) } finally { setLoading(false) }
  }
  const doSignup = async (e) => {
    e.preventDefault(); setLoading(true)
    try { await api('auth/signup', { method: 'POST', body: signup }); toast.success('Account created'); await onAuthed() }
    catch (err) { toast.error(err.message) } finally { setLoading(false) }
  }
  const doReset = async (e) => {
    e.preventDefault(); setLoading(true)
    try { await api('auth/reset-request', { method: 'POST', body: { email: resetEmail } })
      toast.success('If that email exists, a reset link has been sent.'); setResetMode(false) }
    catch (err) { toast.error(err.message) } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-50">
      {/* Brand / value panel */}
      <div className="hidden lg:flex flex-col justify-between bg-slate-900 text-slate-100 p-12">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-amber-500 grid place-items-center"><HardHat className="h-5 w-5 text-slate-900" /></div>
          <span className="text-xl font-semibold tracking-tight">TradeScout</span>
        </div>
        <div className="space-y-6 max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">Verified construction opportunity discovery for trade contractors.</h1>
          <p className="text-slate-400">Every lead is traceable to a real public source. If a fact is unknown, we show it as unavailable — never fabricated.</p>
          <div className="space-y-3 pt-2">
            {[[ShieldCheck, 'Evidence-backed verification'], [FileSearch, 'Source-traceable facts'], [Building2, 'Built for every trade']].map(([Icon, t], i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-slate-300"><Icon className="h-4 w-4 text-amber-500" />{t}</div>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-500">Foundation build — live opportunity discovery is not connected yet.</p>
      </div>

      {/* Auth forms */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <div className="h-9 w-9 rounded-lg bg-amber-500 grid place-items-center"><HardHat className="h-5 w-5 text-slate-900" /></div>
            <span className="text-xl font-semibold">TradeScout</span>
          </div>

          {resetMode ? (
            <form onSubmit={doReset} className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Reset your password</h2>
                <p className="text-sm text-muted-foreground">We’ll email you a reset link.</p>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" required value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="you@company.com" />
              </div>
              <Button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Send reset link
              </Button>
              <button type="button" onClick={() => setResetMode(false)} className="text-sm text-muted-foreground hover:text-foreground w-full text-center">Back to sign in</button>
            </form>
          ) : (
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="login">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-6">
                <form onSubmit={doLogin} className="space-y-4">
                  <div className="space-y-2"><Label>Email</Label>
                    <Input type="email" required value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} placeholder="you@company.com" /></div>
                  <div className="space-y-2"><Label>Password</Label>
                    <Input type="password" required value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} placeholder="••••••••" /></div>
                  <div className="flex justify-end"><button type="button" onClick={() => setResetMode(true)} className="text-sm text-amber-600 hover:underline">Forgot password?</button></div>
                  <Button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900" disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Sign in</Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-6">
                <form onSubmit={doSignup} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>Full name</Label>
                      <Input value={signup.fullName} onChange={(e) => setSignup({ ...signup, fullName: e.target.value })} placeholder="Jane Contractor" /></div>
                    <div className="space-y-2"><Label>Company</Label>
                      <Input value={signup.companyName} onChange={(e) => setSignup({ ...signup, companyName: e.target.value })} placeholder="Acme Trades" /></div>
                  </div>
                  <div className="space-y-2"><Label>Email</Label>
                    <Input type="email" required value={signup.email} onChange={(e) => setSignup({ ...signup, email: e.target.value })} placeholder="you@company.com" /></div>
                  <div className="space-y-2"><Label>Password</Label>
                    <Input type="password" required minLength={6} value={signup.password} onChange={(e) => setSignup({ ...signup, password: e.target.value })} placeholder="At least 6 characters" /></div>
                  <Button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900" disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Create account</Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  )
}

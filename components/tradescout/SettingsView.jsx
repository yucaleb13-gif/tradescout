'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/tradescout/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { TRADES } from '@/lib/tradescout/constants'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function SettingsView({ profile, onUpdated }) {
  const [form, setForm] = useState({ full_name: '', company_name: '', region: '', trade_focus: [] })
  const [pwd, setPwd] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingPwd, setSavingPwd] = useState(false)

  useEffect(() => {
    if (profile) setForm({ full_name: profile.full_name || '', company_name: profile.company_name || '', region: profile.region || '', trade_focus: profile.trade_focus || [] })
  }, [profile])

  const toggleTrade = (v) => setForm((f) => ({ ...f, trade_focus: f.trade_focus.includes(v) ? f.trade_focus.filter((x) => x !== v) : [...f.trade_focus, v] }))

  const saveProfile = async (e) => {
    e.preventDefault(); setSaving(true)
    try { await api('profile', { method: 'PUT', body: form }); toast.success('Profile updated'); onUpdated && onUpdated() }
    catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }
  const changePwd = async (e) => {
    e.preventDefault(); setSavingPwd(true)
    try { await api('auth/update-password', { method: 'POST', body: { password: pwd } }); toast.success('Password changed'); setPwd('') }
    catch (err) { toast.error(err.message) } finally { setSavingPwd(false) }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div><h1 className="text-2xl font-semibold tracking-tight">Settings</h1><p className="text-muted-foreground">Manage your profile and trade focus.</p></div>

      <Card>
        <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Company</Label><Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Email</Label><Input value={profile?.email || ''} disabled /></div>
              <div className="space-y-2"><Label>Default region</Label><Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="e.g. Ontario" /></div>
            </div>
            <div className="space-y-2">
              <Label>Trade focus</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {TRADES.map((t) => (
                  <label key={t.value} className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-slate-50">
                    <Checkbox checked={form.trade_focus.includes(t.value)} onCheckedChange={() => toggleTrade(t.value)} />
                    <span className="text-sm">{t.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <Button type="submit" disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-slate-900">{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Save profile</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Change password</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={changePwd} className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="space-y-2 flex-1"><Label>New password</Label><Input type="password" minLength={6} required value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="At least 6 characters" /></div>
            <Button type="submit" variant="outline" disabled={savingPwd}>{savingPwd && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Update password</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

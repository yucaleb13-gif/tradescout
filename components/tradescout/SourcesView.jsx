'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/tradescout/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { Database, Info } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

const TYPE_LABEL = {
  government_tender: 'Government Tender', municipal_portal: 'Municipal Portal', permit_database: 'Permit Database',
  procurement_portal: 'Procurement Portal', rss_feed: 'RSS Feed', news: 'News', company_site: 'Company Site', other: 'Other',
}

export default function SourcesView() {
  const [sources, setSources] = useState(null)
  useEffect(() => { api('sources').then(setSources).catch(() => setSources([])) }, [])

  const fmt = (d) => d ? new Date(d).toLocaleDateString() : null

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
        <p className="text-muted-foreground">Registry of legitimate public sources. Every real lead must originate here.</p></div>

      <Alert className="border-slate-300 bg-slate-50">
        <Info className="h-4 w-4" />
        <AlertDescription>No real production sources are configured yet. Only clearly-marked DEMO entries appear below — no fabricated sources.</AlertDescription>
      </Alert>

      {!sources && <Skeleton className="h-40 w-full" />}
      {sources && sources.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground"><Database className="h-8 w-8 mx-auto mb-2 opacity-40" />No sources configured.</CardContent></Card>}

      {sources && sources.length > 0 && (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Source name</TableHead><TableHead>Domain</TableHead><TableHead>Type</TableHead>
              <TableHead>Status</TableHead><TableHead className="w-40">Reliability</TableHead><TableHead>Last checked</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {sources.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium"><div className="flex items-center gap-2">{s.name}{s.is_demo && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">DEMO</Badge>}</div></TableCell>
                  <TableCell className="text-muted-foreground">{s.domain}</TableCell>
                  <TableCell>{TYPE_LABEL[s.source_type] || s.source_type}</TableCell>
                  <TableCell>{s.is_active ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Active</Badge> : <Badge variant="outline" className="bg-slate-100 text-slate-600">Inactive</Badge>}</TableCell>
                  <TableCell><div className="flex items-center gap-2"><Progress value={s.trust_level} className="h-2" /><span className="text-xs text-muted-foreground w-8">{s.trust_level}</span></div></TableCell>
                  <TableCell className="text-muted-foreground">{fmt(s.last_crawled_at) || <span className="italic text-slate-400">Never</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </div>
  )
}

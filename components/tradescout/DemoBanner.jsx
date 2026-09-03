'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Info } from 'lucide-react'

export function DemoBanner({ className = '' }) {
  return (
    <Alert className={`border-amber-200 bg-amber-50 text-amber-900 ${className}`}>
      <Info className="h-4 w-4 !text-amber-600" />
      <AlertDescription className="text-amber-800">
        Leads marked <span className="font-semibold">DEMO</span> are interface samples only. All other leads come from approved public sources via live discovery, with evidence attached — unknown facts are shown as unavailable, never invented.
      </AlertDescription>
    </Alert>
  )
}

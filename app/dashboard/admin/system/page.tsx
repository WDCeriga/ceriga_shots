'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type StatusResponse = {
  database?: { configured: boolean }
  gemini?: { configured: boolean }
  auth?: { googleConfigured: boolean; secretConfigured: boolean }
  error?: string
}

export default function AdminSystemPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/status')
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as StatusResponse
        if (!res.ok) throw new Error(data.error || `Status check failed (${res.status})`)
        setStatus(data)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load status'))
  }, [])

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="rounded-xl border border-border/60 bg-[#0a0a0a] p-4 sm:p-5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">System Status</h1>
        <p className="text-sm text-muted-foreground mt-1">Runtime checks for core dependencies.</p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-[#0a0a0a] border-border/70">
          <CardHeader><CardTitle className="text-sm">Database</CardTitle></CardHeader>
          <CardContent><div className="text-lg font-semibold">{status ? (status.database?.configured ? 'Configured' : 'Missing') : '...'}</div></CardContent>
        </Card>
        <Card className="bg-[#0a0a0a] border-border/70">
          <CardHeader><CardTitle className="text-sm">Gemini Key</CardTitle></CardHeader>
          <CardContent><div className="text-lg font-semibold">{status ? (status.gemini?.configured ? 'Configured' : 'Missing') : '...'}</div></CardContent>
        </Card>
        <Card className="bg-[#0a0a0a] border-border/70">
          <CardHeader><CardTitle className="text-sm">Google Auth</CardTitle></CardHeader>
          <CardContent><div className="text-lg font-semibold">{status ? (status.auth?.googleConfigured ? 'Configured' : 'Missing') : '...'}</div></CardContent>
        </Card>
        <Card className="bg-[#0a0a0a] border-border/70">
          <CardHeader><CardTitle className="text-sm">Auth Secret</CardTitle></CardHeader>
          <CardContent><div className="text-lg font-semibold">{status ? (status.auth?.secretConfigured ? 'Configured' : 'Missing') : '...'}</div></CardContent>
        </Card>
      </div>
    </div>
  )
}

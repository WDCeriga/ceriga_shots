'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type StatsResponse = {
  users: number
  projects: number
  queue: { queued: number; processing: number; failed: number }
  shares: { active: number }
}

export default function AdminStatisticsPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as StatsResponse & { error?: string }
        if (!res.ok) throw new Error(data.error || 'Failed to load stats')
        setStats(data)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load stats'))
  }, [])

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Admin Statistics</h1>
        <p className="text-sm text-muted-foreground mt-1">Platform-wide operational overview.</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm">Users</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.users ?? '...'}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Projects</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.projects ?? '...'}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Queued Jobs</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.queue.queued ?? '...'}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Active Shares</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.shares.active ?? '...'}</div></CardContent></Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-sm">Queue: Processing</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{stats?.queue.processing ?? '...'}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Queue: Failed</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{stats?.queue.failed ?? '...'}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Queue Health</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{stats ? (stats.queue.failed > 0 ? 'Attention needed' : 'Healthy') : '...'}</div></CardContent></Card>
      </div>
    </div>
  )
}

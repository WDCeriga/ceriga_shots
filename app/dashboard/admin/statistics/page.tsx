'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type StatsResponse = {
  users: number
  projects: number
  queue: { queued: number; processing: number; failed: number }
  shares: { active: number }
  finance: {
    paidSubscribers: { total: number; starter: number; studio: number; label: number }
    revenue: { mrr: number; arr: number }
    costs: {
      variableCostPerPaidUser: number
      fixedMonthlyCost: number
      estimatedMonthlyCosts: number
    }
    profitability: { grossProfitMonthly: number; grossMarginPercent: number }
  }
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(amount)
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
      <div className="rounded-xl border border-border/60 bg-[#0a0a0a] p-4 sm:p-5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Admin Statistics</h1>
        <p className="text-sm text-muted-foreground mt-1">Platform-wide operational overview.</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-[#0a0a0a] border-border/70"><CardHeader><CardTitle className="text-sm">Users</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.users ?? '...'}</div></CardContent></Card>
        <Card className="bg-[#0a0a0a] border-border/70"><CardHeader><CardTitle className="text-sm">Projects</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.projects ?? '...'}</div></CardContent></Card>
        <Card className="bg-[#0a0a0a] border-border/70"><CardHeader><CardTitle className="text-sm">Queued Jobs</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.queue.queued ?? '...'}</div></CardContent></Card>
        <Card className="bg-[#0a0a0a] border-border/70"><CardHeader><CardTitle className="text-sm">Active Shares</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.shares.active ?? '...'}</div></CardContent></Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-[#0a0a0a] border-border/70"><CardHeader><CardTitle className="text-sm">Queue: Processing</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{stats?.queue.processing ?? '...'}</div></CardContent></Card>
        <Card className="bg-[#0a0a0a] border-border/70"><CardHeader><CardTitle className="text-sm">Queue: Failed</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{stats?.queue.failed ?? '...'}</div></CardContent></Card>
        <Card className="bg-[#0a0a0a] border-border/70"><CardHeader><CardTitle className="text-sm">Queue Health</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{stats ? (stats.queue.failed > 0 ? 'Attention needed' : 'Healthy') : '...'}</div></CardContent></Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Finance</h2>
        <p className="text-xs text-muted-foreground">
          Revenue and cost estimates based on active paid subscriptions and role pricing.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-[#0a0a0a] border-border/70"><CardHeader><CardTitle className="text-sm">MRR</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats ? formatMoney(stats.finance.revenue.mrr) : '...'}</div></CardContent></Card>
        <Card className="bg-[#0a0a0a] border-border/70"><CardHeader><CardTitle className="text-sm">ARR</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats ? formatMoney(stats.finance.revenue.arr) : '...'}</div></CardContent></Card>
        <Card className="bg-[#0a0a0a] border-border/70"><CardHeader><CardTitle className="text-sm">Monthly Costs (est.)</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats ? formatMoney(stats.finance.costs.estimatedMonthlyCosts) : '...'}</div></CardContent></Card>
        <Card className="bg-[#0a0a0a] border-border/70"><CardHeader><CardTitle className="text-sm">Gross Profit / mo</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats ? formatMoney(stats.finance.profitability.grossProfitMonthly) : '...'}</div></CardContent></Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="bg-[#0a0a0a] border-border/70">
          <CardHeader><CardTitle className="text-sm">Gross Margin</CardTitle></CardHeader>
          <CardContent>
            <div className="text-xl font-semibold">
              {stats ? `${stats.finance.profitability.grossMarginPercent.toFixed(1)}%` : '...'}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#0a0a0a] border-border/70">
          <CardHeader><CardTitle className="text-sm">Active Paid Subscribers</CardTitle></CardHeader>
          <CardContent>
            <div className="text-xl font-semibold">{stats?.finance.paidSubscribers.total ?? '...'}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Starter {stats?.finance.paidSubscribers.starter ?? '...'} • Studio {stats?.finance.paidSubscribers.studio ?? '...'} • Label {stats?.finance.paidSubscribers.label ?? '...'}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-[#0a0a0a] border-border/70">
          <CardHeader><CardTitle className="text-sm">Cost Assumptions</CardTitle></CardHeader>
          <CardContent>
            <div className="text-sm">
              <p>Variable: {stats ? `${formatMoney(stats.finance.costs.variableCostPerPaidUser)} / paid user` : '...'}</p>
              <p className="mt-1">Fixed: {stats ? `${formatMoney(stats.finance.costs.fixedMonthlyCost)} / month` : '...'}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchJsonCached, peekJsonCache } from '@/lib/client-fetch-cache'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar } from 'lucide-react'

type StatsResponse = {
  range: '1d' | '7d' | '30d' | 'all' | 'custom'
  fromDate: string | null
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
      generation: {
        successfulGenerations: number
        successfulModelCalls: number
        allBilledModelCalls: number
        costPerModelCall: number
        estimatedTotalCost: number
        estimatedBilledTotalCost: number
      }
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

function formatMoneyPrecise(amount: number) {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(amount)
}

const RANGE_OPTIONS = [
  { key: '1d', label: '1D' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: 'all', label: 'ALL' },
] as const

function toDateInputValue(daysBack: number): string {
  const d = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function todayDateInputValue(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatDateOnly(date: Date): string {
  return date.toLocaleDateString()
}

export default function AdminStatisticsPage() {
  const dateInputRef = useRef<HTMLInputElement | null>(null)
  const [range, setRange] = useState<StatsResponse['range']>('1d')
  const [customFromDate, setCustomFromDate] = useState('')
  const cacheKey = `admin-stats:${range}:${customFromDate || 'none'}`
  const cachedStats = peekJsonCache<StatsResponse>(cacheKey)
  const [stats, setStats] = useState<StatsResponse | null>(cachedStats)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(!cachedStats)

  useEffect(() => {
    let cancelled = false
    setIsLoading(!peekJsonCache<StatsResponse>(cacheKey))
    const query = customFromDate
      ? `/api/admin/stats?range=custom&from=${encodeURIComponent(customFromDate)}`
      : `/api/admin/stats?range=${range}`
    fetchJsonCached<StatsResponse>(cacheKey, query, { ttlMs: 15_000 })
      .then((data) => {
        if (cancelled) return
        setStats(data)
        setError(null)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load stats')
      })
      .finally(() => {
        if (cancelled) return
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [cacheKey, customFromDate, range])

  const periodLabel = stats?.range === 'all'
    ? `All time until ${formatDateOnly(new Date())}`
    : stats?.fromDate
      ? `${formatDateOnly(new Date(stats.fromDate))} → ${formatDateOnly(new Date())}`
      : `Today until ${formatDateOnly(new Date())}`

  const keyMetrics = [
    { title: 'New Users', value: stats?.users ?? '...', tone: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' },
    { title: 'New Projects', value: stats?.projects ?? '...', tone: 'text-fuchsia-300 border-fuchsia-500/30 bg-fuchsia-500/10' },
    { title: 'Successful Generations', value: stats?.finance.costs.generation.successfulGenerations ?? '...', tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
    { title: 'MRR', value: stats ? formatMoney(stats.finance.revenue.mrr) : '...', tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
  ] as const

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="rounded-xl border border-border/60 bg-[#0a0a0a] p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Admin Statistics</h1>
           </div>
          <div className="flex items-center gap-2">
            {RANGE_OPTIONS.map((opt) => (
              <Button
                key={opt.key}
                size="sm"
                variant={range === opt.key ? 'default' : 'outline'}
                onClick={() => {
                  setRange(opt.key)
                  if (opt.key === '1d') setCustomFromDate(todayDateInputValue())
                  else if (opt.key === '7d') setCustomFromDate(toDateInputValue(7))
                  else if (opt.key === '30d') setCustomFromDate(toDateInputValue(30))
                  else setCustomFromDate('')
                }}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">{periodLabel}</p>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Calendar start</span>
            <div className="relative">
              <Input
                ref={dateInputRef}
                type="date"
                className="h-8 w-[190px] pr-9 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-0"
                value={customFromDate}
                onChange={(e) => {
                  const next = e.target.value
                  setCustomFromDate(next)
                  if (next) setRange('custom')
                }}
                max={new Date().toISOString().slice(0, 10)}
              />
              <button
                type="button"
                aria-label="Open calendar"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/90 hover:text-white"
                onClick={() => {
                  const input = dateInputRef.current
                  if (!input) return
                  if ('showPicker' in input && typeof input.showPicker === 'function') {
                    input.showPicker()
                  } else {
                    input.focus()
                    input.click()
                  }
                }}
              >
                <Calendar className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {keyMetrics.map((m) => (
          <Card key={m.title} className={`border ${m.tone}`}>
            <CardHeader>
              <CardTitle className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{m.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black">{m.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-violet-500/30 bg-violet-500/10">
        <CardHeader>
          <CardTitle className="text-sm">Queue Snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-300/90">Queued</p>
              <p className="mt-1 text-2xl font-black text-cyan-200">{stats?.queue.queued ?? '...'}</p>
            </div>
            <div className="rounded-md border border-violet-500/30 bg-violet-500/10 p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-violet-300/90">Processing</p>
              <p className="mt-1 text-2xl font-black text-violet-200">{stats?.queue.processing ?? '...'}</p>
            </div>
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-rose-300/90">Failed</p>
              <p className="mt-1 text-2xl font-black text-rose-200">{stats?.queue.failed ?? '...'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-emerald-500/30 bg-emerald-500/10">
          <CardHeader><CardTitle className="text-sm">Revenue &amp; Margin</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between"><span>Annual Run Rate</span><span className="font-semibold">{stats ? formatMoney(stats.finance.revenue.arr) : '...'}</span></div>
            <div className="flex items-center justify-between"><span>Estimated Monthly Cost</span><span className="font-semibold">{stats ? formatMoney(stats.finance.costs.estimatedMonthlyCosts) : '...'}</span></div>
            <div className="flex items-center justify-between"><span>Estimated Monthly Gross Profit</span><span className="font-semibold">{stats ? formatMoney(stats.finance.profitability.grossProfitMonthly) : '...'}</span></div>
            <div className="flex items-center justify-between"><span>Gross Margin %</span><span className="font-semibold">{stats ? `${stats.finance.profitability.grossMarginPercent.toFixed(1)}%` : '...'}</span></div>
          </CardContent>
        </Card>

        <Card className="border-sky-500/30 bg-sky-500/10">
          <CardHeader><CardTitle className="text-sm">Generation Costs</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between"><span>Generation Attempts</span><span className="font-semibold">{stats?.finance.costs.generation.successfulModelCalls ?? '...'}</span></div>
            <div className="flex items-center justify-between"><span>Billable Images</span><span className="font-semibold">{stats?.finance.costs.generation.allBilledModelCalls ?? '...'}</span></div>
            <div className="flex items-center justify-between"><span>Cost per Billable Image</span><span className="font-semibold">{stats ? formatMoneyPrecise(stats.finance.costs.generation.costPerModelCall) : '...'}</span></div>
            <div className="flex items-center justify-between"><span>Estimated Billable Cost</span><span className="font-semibold">{stats ? formatMoney(stats.finance.costs.generation.estimatedBilledTotalCost) : '...'}</span></div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

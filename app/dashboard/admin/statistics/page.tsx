'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchJsonCached, peekJsonCache } from '@/lib/client-fetch-cache'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar, CircleHelp, Download, RefreshCw } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from 'recharts'

type StatsResponse = {
  range: '1d' | '7d' | '30d' | 'all' | 'custom'
  fromDate: string | null
  toDate: string | null
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
  comparisons: {
    previousWindow: { fromDate: string; toDate: string } | null
    users: { current: number; previous: number; pctChange: number | null }
    projects: { current: number; previous: number; pctChange: number | null }
    successfulGenerations: { current: number; previous: number; pctChange: number | null }
    mrr: { current: number; previous: number | null; pctChange: number | null }
  }
  charts: {
    daily: Array<{ day: string; users: number; projects: number; generations: number }>
  }
  breakdowns: {
    topUsers: Array<{ userId: string; email: string; projects: number; generated: number }>
    shotPreset: Array<{
      shotType: string
      preset: string
      total: number
      done: number
      failed: number
      failureRatePct: number
    }>
  }
  meta?: {
    generatedAt?: string
    cached?: boolean
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

function formatDelta(delta: number | null): string {
  if (delta == null) return '—'
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(1)}%`
}

export default function AdminStatisticsPage() {
  const fromDateInputRef = useRef<HTMLInputElement | null>(null)
  const toDateInputRef = useRef<HTMLInputElement | null>(null)
  const [range, setRange] = useState<StatsResponse['range']>('1d')
  const [customFromDate, setCustomFromDate] = useState(todayDateInputValue())
  const [customToDate, setCustomToDate] = useState(todayDateInputValue())
  const cacheKey = `admin-stats:${range}:${customFromDate || 'none'}:${customToDate || 'none'}`
  const cachedStats = peekJsonCache<StatsResponse>(cacheKey)
  const [stats, setStats] = useState<StatsResponse | null>(cachedStats)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(!cachedStats)
  const [rangeWarning, setRangeWarning] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const qRange = params.get('range')
    const qFrom = params.get('from')
    const qTo = params.get('to')
    if (qRange === '1d' || qRange === '7d' || qRange === '30d' || qRange === 'all' || qRange === 'custom') {
      setRange(qRange)
    }
    if (qFrom) setCustomFromDate(qFrom)
    if (qTo) setCustomToDate(qTo)
  }, [])

  useEffect(() => {
    if (!customFromDate || !customToDate) return
    const fromMs = new Date(customFromDate).getTime()
    const toMs = new Date(customToDate).getTime()
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs <= toMs) {
      setRangeWarning(null)
      return
    }
    setCustomFromDate(customToDate)
    setCustomToDate(customFromDate)
    setRangeWarning('Start date was after end date. Dates were swapped automatically.')
  }, [customFromDate, customToDate])

  useEffect(() => {
    let cancelled = false
    setIsLoading(!peekJsonCache<StatsResponse>(cacheKey))
    const query = customFromDate || customToDate
      ? `/api/admin/stats?range=custom${customFromDate ? `&from=${encodeURIComponent(customFromDate)}` : ''}${
          customToDate ? `&to=${encodeURIComponent(customToDate)}` : ''
        }`
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
  }, [cacheKey, customFromDate, customToDate, range])

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('range', range)
    if (customFromDate) params.set('from', customFromDate)
    if (customToDate) params.set('to', customToDate)
    const next = `${window.location.pathname}?${params.toString()}`
    window.history.replaceState(null, '', next)
  }, [customFromDate, customToDate, range])

  const periodLabel =
    stats?.range === 'all'
      ? `All time until ${formatDateOnly(new Date())}`
      : stats?.fromDate && stats?.toDate
        ? `${formatDateOnly(new Date(stats.fromDate))} → ${formatDateOnly(new Date(stats.toDate))}`
        : stats?.fromDate
          ? `${formatDateOnly(new Date(stats.fromDate))} → ${formatDateOnly(new Date())}`
          : stats?.toDate
            ? `Beginning → ${formatDateOnly(new Date(stats.toDate))}`
            : `Today until ${formatDateOnly(new Date())}`

  const keyMetrics = [
    {
      title: 'New Users',
      value: stats?.users ?? '...',
      delta: stats?.comparisons.users.pctChange ?? null,
      tone: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10',
    },
    {
      title: 'New Projects',
      value: stats?.projects ?? '...',
      delta: stats?.comparisons.projects.pctChange ?? null,
      tone: 'text-fuchsia-300 border-fuchsia-500/30 bg-fuchsia-500/10',
    },
    {
      title: 'Successful Generations',
      value: stats?.finance.costs.generation.successfulGenerations ?? '...',
      delta: stats?.comparisons.successfulGenerations.pctChange ?? null,
      tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    },
    {
      title: 'MRR',
      value: stats ? formatMoney(stats.finance.revenue.mrr) : '...',
      delta: stats?.comparisons.mrr.pctChange ?? null,
      tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
    },
  ] as const

  const chartConfig = {
    users: { label: 'Users', color: '#22d3ee' },
    projects: { label: 'Projects', color: '#f472b6' },
    generations: { label: 'Generations', color: '#a78bfa' },
  } as const

  const handleRefresh = () => {
    setStats(null)
    setIsLoading(true)
    setError(null)
    window.location.reload()
  }

  const handleExportCsv = () => {
    if (!stats) return
    const rows = [
      ['date', 'users', 'projects', 'generations'],
      ...stats.charts.daily.map((r) => [r.day, String(r.users), String(r.projects), String(r.generations)]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `admin-stats-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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
                  if (opt.key === '1d') {
                    setCustomFromDate(todayDateInputValue())
                    setCustomToDate(todayDateInputValue())
                  } else if (opt.key === '7d') {
                    setCustomFromDate(toDateInputValue(7))
                    setCustomToDate(todayDateInputValue())
                  } else if (opt.key === '30d') {
                    setCustomFromDate(toDateInputValue(30))
                    setCustomToDate(todayDateInputValue())
                  } else {
                    setCustomFromDate('')
                    setCustomToDate('')
                  }
                }}
              >
                {opt.label}
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportCsv} disabled={!stats}>
              <Download className="mr-1 h-4 w-4" />
              CSV
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">{periodLabel}</p>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Calendar range</span>
            <div className="relative">
              <Input
                ref={fromDateInputRef}
                type="date"
                className="h-8 w-[170px] pr-9 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-0"
                value={customFromDate}
                onChange={(e) => {
                  const next = e.target.value
                  setCustomFromDate(next)
                  if (next) setRange('custom')
                }}
                max={customToDate || new Date().toISOString().slice(0, 10)}
              />
              <button
                type="button"
                aria-label="Open start calendar"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/90 hover:text-white"
                onClick={() => {
                  const input = fromDateInputRef.current
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
            <span className="text-xs text-muted-foreground">to</span>
            <div className="relative">
              <Input
                ref={toDateInputRef}
                type="date"
                className="h-8 w-[170px] pr-9 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-0"
                value={customToDate}
                onChange={(e) => {
                  const next = e.target.value
                  setCustomToDate(next)
                  if (next) setRange('custom')
                }}
                min={customFromDate || undefined}
                max={new Date().toISOString().slice(0, 10)}
              />
              <button
                type="button"
                aria-label="Open end calendar"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/90 hover:text-white"
                onClick={() => {
                  const input = toDateInputRef.current
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
        {rangeWarning ? <p className="mt-2 text-xs text-amber-300">{rangeWarning}</p> : null}
        <p className="mt-1 text-[11px] text-muted-foreground">
          {stats?.meta?.cached ? 'Cached' : 'Live'} • Updated{' '}
          {stats?.meta?.generatedAt ? new Date(stats.meta.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {keyMetrics.map((m) => (
          <Card key={m.title} className={`border ${m.tone}`}>
            <CardHeader>
              <CardTitle className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{m.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-black">{m.value}</div>}
              <div className="mt-1 text-xs text-muted-foreground">vs prev: {formatDelta(m.delta)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-cyan-500/30 bg-cyan-500/10">
        <CardHeader>
          <CardTitle className="text-sm">Daily Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[280px] w-full bg-cyan-300/20" />
          ) : (
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
              <LineChart data={stats?.charts.daily ?? []} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="users" stroke="var(--color-users)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="projects" stroke="var(--color-projects)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="generations" stroke="var(--color-generations)" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card className="border-violet-500/30 bg-violet-500/10">
        <CardHeader>
          <CardTitle className="text-sm">Queue Snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-300/90">Queued</p>
              {isLoading ? (
                <Skeleton className="mt-1 h-8 w-14 bg-cyan-300/30" />
              ) : (
                <p className="mt-1 text-2xl font-black text-cyan-200">{stats?.queue.queued ?? '...'}</p>
              )}
            </div>
            <div className="rounded-md border border-violet-500/30 bg-violet-500/10 p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-violet-300/90">Processing</p>
              {isLoading ? (
                <Skeleton className="mt-1 h-8 w-14 bg-violet-300/30" />
              ) : (
                <p className="mt-1 text-2xl font-black text-violet-200">{stats?.queue.processing ?? '...'}</p>
              )}
            </div>
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-rose-300/90">Failed</p>
              {isLoading ? (
                <Skeleton className="mt-1 h-8 w-14 bg-rose-300/30" />
              ) : (
                <p className="mt-1 text-2xl font-black text-rose-200">{stats?.queue.failed ?? '...'}</p>
              )}
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
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1">
                Generation Attempts
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Generation attempts info">
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={6}>Successful model calls for completed generation jobs.</TooltipContent>
                </Tooltip>
              </span>
              <span className="font-semibold">{stats?.finance.costs.generation.successfulModelCalls ?? '...'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1">
                Billable Images
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Billable images info">
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={6}>Completed generated outputs counted as billed images.</TooltipContent>
                </Tooltip>
              </span>
              <span className="font-semibold">{stats?.finance.costs.generation.allBilledModelCalls ?? '...'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1">
                Cost per Billable Image
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Cost per billable image info">
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={6}>Configured unit cost used for billing/cost estimate calculations.</TooltipContent>
                </Tooltip>
              </span>
              <span className="font-semibold">{stats ? formatMoneyPrecise(stats.finance.costs.generation.costPerModelCall) : '...'}</span>
            </div>
            <div className="flex items-center justify-between"><span>Estimated Billable Cost</span><span className="font-semibold">{stats ? formatMoney(stats.finance.costs.generation.estimatedBilledTotalCost) : '...'}</span></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60 bg-[#0a0a0a]">
          <CardHeader>
            <CardTitle className="text-sm">Top Users by Generated Output</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(stats?.breakdowns.topUsers ?? []).map((u) => (
              <div key={u.userId} className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate">{u.email}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.userId}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>Projects: <span className="font-semibold text-foreground">{u.projects}</span></div>
                  <div>Generated: <span className="font-semibold text-foreground">{u.generated}</span></div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-[#0a0a0a]">
          <CardHeader>
            <CardTitle className="text-sm">Shot/Preset Failure Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(stats?.breakdowns.shotPreset ?? []).slice(0, 10).map((r) => (
              <div key={`${r.shotType}-${r.preset}`} className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
                <div>
                  <p className="font-medium">{r.shotType}</p>
                  <p className="text-xs text-muted-foreground">{r.preset}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>Total: <span className="font-semibold text-foreground">{r.total}</span></div>
                  <div>Fail: <span className="font-semibold text-rose-300">{r.failureRatePct}%</span></div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

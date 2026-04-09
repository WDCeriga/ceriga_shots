import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured, db, ensureSchema } from '@/lib/db'
import { findUserById } from '@/lib/users'
import { pricingPlans } from '@/lib/pricing'

export const runtime = 'nodejs'
const ACTIVE_BILLING_STATUSES = ['active', 'trialing', 'past_due'] as const
type StatsRange = '1d' | '7d' | '30d' | 'all' | 'custom'
const STATS_CACHE_TTL_MS = 20_000
const statsResponseCache = new Map<string, { expiresAt: number; payload: unknown }>()

function parseRange(input: string | null): StatsRange {
  if (input === '1d' || input === '7d' || input === '30d' || input === 'all' || input === 'custom') return input
  return '1d'
}

function rangeToStart(range: StatsRange): Date | null {
  if (range === 'all' || range === 'custom') return null
  if (range === '1d') {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return start
  }
  const days = range === '7d' ? 7 : 30
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function parseFromDate(input: string | null): Date | null {
  if (!input) return null
  const parsed = new Date(input)
  if (Number.isNaN(parsed.getTime())) return null
  parsed.setHours(0, 0, 0, 0)
  return parsed
}

function parseToDate(input: string | null): Date | null {
  if (!input) return null
  const parsed = new Date(input)
  if (Number.isNaN(parsed.getTime())) return null
  parsed.setHours(23, 59, 59, 999)
  return parsed
}

function money(value: number): number {
  return Number(value.toFixed(2))
}

function moneyPrecise(value: number, digits = 3): number {
  return Number(value.toFixed(digits))
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await findUserById(userId)
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Database is not configured (missing DATABASE_URL).' }, { status: 503 })
  }

  await ensureSchema()
  const url = new URL(req.url)
  const rangeParam = parseRange(url.searchParams.get('range'))
  const customFromDate = parseFromDate(url.searchParams.get('from'))
  const customToDate = parseToDate(url.searchParams.get('to'))
  const range: StatsRange = customFromDate || customToDate ? 'custom' : rangeParam
  const fromDateIso = customFromDate?.toISOString()
  const toDateIso = customToDate?.toISOString()
  const fromDate = customFromDate ?? rangeToStart(range)
  const toDate = customToDate ?? null
  const fromTimestampMs = fromDate ? fromDate.getTime() : null
  const toTimestampMs = toDate ? toDate.getTime() : null
  const cacheKey = `${userId}|${range}|${fromDate?.toISOString() ?? 'none'}|${toDate?.toISOString() ?? 'none'}`
  const now = Date.now()
  const cached = statsResponseCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.payload, {
      headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=30' },
    })
  }

  const usersQuery = fromDate && toDate
    ? db`
        select count(*)::int as count
        from users
        where created_at >= ${fromDateIso!}
          and created_at <= ${toDateIso!}
      `
    : fromDate
      ? db`select count(*)::int as count from users where created_at >= ${fromDate.toISOString()}`
      : toDate
        ? db`select count(*)::int as count from users where created_at <= ${toDateIso!}`
        : db`select count(*)::int as count from users`
  const projectsQuery = fromDate && toDate
    ? db`
        select count(*)::int as count
        from projects
        where created_at >= ${fromDateIso!}
          and created_at <= ${toDateIso!}
      `
    : fromDate
      ? db`select count(*)::int as count from projects where created_at >= ${fromDate.toISOString()}`
      : toDate
        ? db`select count(*)::int as count from projects where created_at <= ${toDateIso!}`
        : db`select count(*)::int as count from projects`
  const queueCountsQuery = fromDate && toDate
    ? db`
        select
          count(*) filter (where status = 'queued')::int as queued,
          count(*) filter (where status = 'processing')::int as processing,
          count(*) filter (where status = 'failed')::int as failed
        from generation_jobs
        where created_at >= ${fromDateIso!}
          and created_at <= ${toDateIso!}
      `
    : fromDate
      ? db`
        select
          count(*) filter (where status = 'queued')::int as queued,
          count(*) filter (where status = 'processing')::int as processing,
          count(*) filter (where status = 'failed')::int as failed
        from generation_jobs
        where created_at >= ${fromDate.toISOString()}
      `
      : toDate
        ? db`
        select
          count(*) filter (where status = 'queued')::int as queued,
          count(*) filter (where status = 'processing')::int as processing,
          count(*) filter (where status = 'failed')::int as failed
        from generation_jobs
        where created_at <= ${toDateIso!}
      `
        : db`
        select
          count(*) filter (where status = 'queued')::int as queued,
          count(*) filter (where status = 'processing')::int as processing,
          count(*) filter (where status = 'failed')::int as failed
        from generation_jobs
      `
  const sharesActiveQuery = fromDate && toDate
    ? db`
        select count(*)::int as count
        from project_shares
        where revoked_at is null
          and (expires_at is null or expires_at > now())
          and created_at >= ${fromDateIso!}
          and created_at <= ${toDateIso!}
      `
    : fromDate
      ? db`
        select count(*)::int as count
        from project_shares
        where revoked_at is null
          and (expires_at is null or expires_at > now())
          and created_at >= ${fromDate.toISOString()}
      `
      : toDate
        ? db`
        select count(*)::int as count
        from project_shares
        where revoked_at is null
          and (expires_at is null or expires_at > now())
          and created_at <= ${toDateIso!}
      `
        : db`
        select count(*)::int as count
        from project_shares
        where revoked_at is null and (expires_at is null or expires_at > now())
      `
  const paidRowsQuery = fromDate && toDate
    ? db`
        select role, count(*)::int as count
        from users
        where role in ('starter', 'studio', 'label')
          and stripe_subscription_status = any(${ACTIVE_BILLING_STATUSES}::text[])
          and created_at >= ${fromDateIso!}
          and created_at <= ${toDateIso!}
        group by role
      `
    : fromDate
      ? db`
        select role, count(*)::int as count
        from users
        where role in ('starter', 'studio', 'label')
          and stripe_subscription_status = any(${ACTIVE_BILLING_STATUSES}::text[])
          and created_at >= ${fromDate.toISOString()}
        group by role
      `
      : toDate
        ? db`
        select role, count(*)::int as count
        from users
        where role in ('starter', 'studio', 'label')
          and stripe_subscription_status = any(${ACTIVE_BILLING_STATUSES}::text[])
          and created_at <= ${toDateIso!}
        group by role
      `
        : db`
        select role, count(*)::int as count
        from users
        where role in ('starter', 'studio', 'label')
          and stripe_subscription_status = any(${ACTIVE_BILLING_STATUSES}::text[])
        group by role
      `
  const successfulGenerationsQuery = db`
    select count(*)::int as count
    from projects p
    cross join lateral jsonb_array_elements(p.generated_images) as gi
    where coalesce(gi->>'url', '') <> ''
      and lower(coalesce(gi->>'url', '')) not like 'http://localhost%'
      and lower(coalesce(gi->>'url', '')) not like 'https://localhost%'
      and (
        ${fromTimestampMs}::bigint is null
        or coalesce(nullif(gi->>'timestamp', '')::bigint, 0) >= ${fromTimestampMs}::bigint
      )
      and (
        ${toTimestampMs}::bigint is null
        or coalesce(nullif(gi->>'timestamp', '')::bigint, 0) <= ${toTimestampMs}::bigint
      )
  `
  const successfulGenerationModelCallsQuery = fromDate && toDate
    ? db`
        select coalesce(sum(model_calls), 0)::int as total
        from generation_jobs
        where status = 'done'
          and model_calls > 0
          and created_at >= ${fromDateIso!}
          and created_at <= ${toDateIso!}
      `
    : fromDate
      ? db`
        select coalesce(sum(model_calls), 0)::int as total
        from generation_jobs
        where status = 'done'
          and model_calls > 0
          and created_at >= ${fromDate.toISOString()}
      `
      : toDate
        ? db`
        select coalesce(sum(model_calls), 0)::int as total
        from generation_jobs
        where status = 'done'
          and model_calls > 0
          and created_at <= ${toDateIso!}
      `
        : db`
        select coalesce(sum(model_calls), 0)::int as total
        from generation_jobs
        where status = 'done'
          and model_calls > 0
      `

  const [
    usersRows,
    projectsRows,
    queueCountsRows,
    sharesActiveRows,
    paidRows,
    successfulGenerationsRows,
    successfulGenerationModelCallsRows,
  ] = await Promise.all([
    usersQuery,
    projectsQuery,
    queueCountsQuery,
    sharesActiveQuery,
    paidRowsQuery,
    successfulGenerationsQuery,
    successfulGenerationModelCallsQuery,
  ])

  const usersRow = (usersRows as Array<{ count: number }>)[0]
  const projectsRow = (projectsRows as Array<{ count: number }>)[0]
  const queueCountsRow = (queueCountsRows as Array<{ queued: number; processing: number; failed: number }>)[0]
  const sharesActiveRow = (sharesActiveRows as Array<{ count: number }>)[0]
  const paidRowsTyped = paidRows as Array<{ role: 'starter' | 'studio' | 'label'; count: number }>
  const successfulGenerationsRow = (successfulGenerationsRows as Array<{ count: number }>)[0]
  const successfulGenerationModelCallsRow = (successfulGenerationModelCallsRows as Array<{ total: number }>)[0]

  const roleCounts = { starter: 0, studio: 0, label: 0 }
  for (const row of paidRowsTyped) {
    roleCounts[row.role] = Number(row.count ?? 0)
  }

  const starterMonthly = pricingPlans.find((p) => p.name === 'Starter')?.monthlyPrice ?? 0
  const studioMonthly = pricingPlans.find((p) => p.name === 'Studio')?.monthlyPrice ?? 0
  const labelMonthly = pricingPlans.find((p) => p.name === 'Label')?.monthlyPrice ?? 0

  const mrr = roleCounts.starter * starterMonthly + roleCounts.studio * studioMonthly + roleCounts.label * labelMonthly
  const activePaidSubscribers = roleCounts.starter + roleCounts.studio + roleCounts.label
  const variableCostPerPaidUser = Number(process.env.FINANCE_COST_PER_ACTIVE_SUBSCRIBER ?? 3)
  const fixedMonthlyCost = Number(process.env.FINANCE_FIXED_MONTHLY_COST ?? 0)
  // Replicate `google/gemini-2.5-flash-image` default unit cost per API call/output image.
  const costPerModelCall = Number(process.env.FINANCE_COST_PER_MODEL_CALL ?? 0.039)
  const successfulGenerations = Number(successfulGenerationsRow?.count ?? 0)
  const successfulGenerationModelCalls = Number(successfulGenerationModelCallsRow?.total ?? 0)
  // Replicate billing for this model is output-image based.
  // Failed/retry attempts should not be counted as billed calls.
  const allBilledModelCalls = successfulGenerations
  const estimatedGenerationCostTotal = successfulGenerationModelCalls * costPerModelCall
  const estimatedBilledGenerationCostTotal = allBilledModelCalls * costPerModelCall
  const estimatedMonthlyCosts = activePaidSubscribers * variableCostPerPaidUser + fixedMonthlyCost
  const grossProfitMonthly = mrr - estimatedMonthlyCosts
  const grossMarginPercent = mrr > 0 ? (grossProfitMonthly / mrr) * 100 : 0

  const payload = {
    range,
    fromDate: fromDate ? fromDate.toISOString() : null,
    toDate: toDate ? toDate.toISOString() : null,
    users: Number(usersRow?.count ?? 0),
    projects: Number(projectsRow?.count ?? 0),
    queue: {
      queued: Number(queueCountsRow?.queued ?? 0),
      processing: Number(queueCountsRow?.processing ?? 0),
      failed: Number(queueCountsRow?.failed ?? 0),
    },
    shares: {
      active: Number(sharesActiveRow?.count ?? 0),
    },
    finance: {
      paidSubscribers: {
        total: activePaidSubscribers,
        starter: roleCounts.starter,
        studio: roleCounts.studio,
        label: roleCounts.label,
      },
      revenue: {
        mrr: money(mrr),
        arr: money(mrr * 12),
      },
      costs: {
        variableCostPerPaidUser: money(variableCostPerPaidUser),
        fixedMonthlyCost: money(fixedMonthlyCost),
        estimatedMonthlyCosts: money(estimatedMonthlyCosts),
        generation: {
          successfulGenerations,
          successfulModelCalls: successfulGenerationModelCalls,
          allBilledModelCalls,
          costPerModelCall: moneyPrecise(costPerModelCall, 3),
          estimatedTotalCost: money(estimatedGenerationCostTotal),
          estimatedBilledTotalCost: money(estimatedBilledGenerationCostTotal),
        },
      },
      profitability: {
        grossProfitMonthly: money(grossProfitMonthly),
        grossMarginPercent: money(grossMarginPercent),
      },
    },
  }

  statsResponseCache.set(cacheKey, { expiresAt: now + STATS_CACHE_TTL_MS, payload })
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=30' },
  })
}

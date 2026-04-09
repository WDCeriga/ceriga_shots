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

function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  if (previous === 0) return current === 0 ? 0 : null
  return Number((((current - previous) / previous) * 100).toFixed(1))
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
    const cachedPayload =
      cached.payload && typeof cached.payload === 'object'
        ? {
            ...(cached.payload as Record<string, unknown>),
            meta: {
              ...(((cached.payload as Record<string, unknown>).meta as Record<string, unknown> | undefined) ?? {}),
              cached: true,
            },
          }
        : cached.payload
    return NextResponse.json(cachedPayload, {
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

  const nowDate = new Date()
  const currentToDate = toDate ?? nowDate
  const hasComparableWindow = Boolean(fromDate)
  const currentFromDate = fromDate ?? null
  const windowMs = currentFromDate ? currentToDate.getTime() - currentFromDate.getTime() + 1 : null
  const previousFromDate = hasComparableWindow && windowMs
    ? new Date(currentFromDate!.getTime() - windowMs)
    : null
  const previousToDate = hasComparableWindow
    ? new Date(currentFromDate!.getTime() - 1)
    : null

  const previousUsersQuery =
    previousFromDate && previousToDate
      ? db`
          select count(*)::int as count
          from users
          where created_at >= ${previousFromDate.toISOString()}
            and created_at <= ${previousToDate.toISOString()}
        `
      : db`select 0::int as count`
  const previousProjectsQuery =
    previousFromDate && previousToDate
      ? db`
          select count(*)::int as count
          from projects
          where created_at >= ${previousFromDate.toISOString()}
            and created_at <= ${previousToDate.toISOString()}
        `
      : db`select 0::int as count`
  const previousSuccessfulGenerationsQuery =
    previousFromDate && previousToDate
      ? db`
          select count(*)::int as count
          from projects p
          cross join lateral jsonb_array_elements(p.generated_images) as gi
          where coalesce(gi->>'url', '') <> ''
            and lower(coalesce(gi->>'url', '')) not like 'http://localhost%'
            and lower(coalesce(gi->>'url', '')) not like 'https://localhost%'
            and coalesce(nullif(gi->>'timestamp', '')::bigint, 0) >= ${previousFromDate.getTime()}::bigint
            and coalesce(nullif(gi->>'timestamp', '')::bigint, 0) <= ${previousToDate.getTime()}::bigint
        `
      : db`select 0::int as count`

  const chartFromDate = fromDate ?? new Date((toDate ?? nowDate).getTime() - 29 * 24 * 60 * 60 * 1000)
  const chartToDate = toDate ?? nowDate
  const dailySeriesQuery = db`
    with days as (
      select generate_series(
        date_trunc('day', ${chartFromDate.toISOString()}::timestamptz),
        date_trunc('day', ${chartToDate.toISOString()}::timestamptz),
        interval '1 day'
      ) as day
    ),
    users_daily as (
      select date_trunc('day', created_at) as day, count(*)::int as value
      from users
      where created_at >= ${chartFromDate.toISOString()}
        and created_at <= ${chartToDate.toISOString()}
      group by 1
    ),
    projects_daily as (
      select date_trunc('day', created_at) as day, count(*)::int as value
      from projects
      where created_at >= ${chartFromDate.toISOString()}
        and created_at <= ${chartToDate.toISOString()}
      group by 1
    ),
    generations_daily as (
      select date_trunc('day', to_timestamp((gi->>'timestamp')::bigint / 1000.0)) as day, count(*)::int as value
      from projects p
      cross join lateral jsonb_array_elements(p.generated_images) as gi
      where coalesce(gi->>'url', '') <> ''
        and lower(coalesce(gi->>'url', '')) not like 'http://localhost%'
        and lower(coalesce(gi->>'url', '')) not like 'https://localhost%'
        and to_timestamp((gi->>'timestamp')::bigint / 1000.0) >= ${chartFromDate.toISOString()}
        and to_timestamp((gi->>'timestamp')::bigint / 1000.0) <= ${chartToDate.toISOString()}
      group by 1
    )
    select
      to_char(days.day, 'YYYY-MM-DD') as day,
      coalesce(users_daily.value, 0)::int as users,
      coalesce(projects_daily.value, 0)::int as projects,
      coalesce(generations_daily.value, 0)::int as generations
    from days
    left join users_daily on users_daily.day = days.day
    left join projects_daily on projects_daily.day = days.day
    left join generations_daily on generations_daily.day = days.day
    order by days.day asc
  `

  const topUsersQuery = db`
    select
      u.id as user_id,
      u.email as email,
      count(p.id)::int as project_count,
      coalesce(sum(jsonb_array_length(coalesce(p.generated_images, '[]'::jsonb))), 0)::int as generated_count
    from users u
    left join projects p
      on p.owner_id = u.id::text
      and p.created_at >= ${fromDate?.toISOString() ?? '1970-01-01T00:00:00.000Z'}
      and p.created_at <= ${currentToDate.toISOString()}
    group by u.id, u.email
    order by generated_count desc, project_count desc
    limit 10
  `

  const shotPresetBreakdownQuery = db`
    select
      shot_type,
      preset,
      count(*)::int as total,
      count(*) filter (where status = 'failed')::int as failed,
      count(*) filter (where status = 'done')::int as done
    from generation_jobs
    where created_at >= ${fromDate?.toISOString() ?? '1970-01-01T00:00:00.000Z'}
      and created_at <= ${currentToDate.toISOString()}
    group by shot_type, preset
    order by total desc
    limit 30
  `

  const [previousUsersRows, previousProjectsRows, previousSuccessfulGenerationsRows, dailySeriesRows, topUsersRows, shotPresetBreakdownRows] =
    await Promise.all([
      previousUsersQuery,
      previousProjectsQuery,
      previousSuccessfulGenerationsQuery,
      dailySeriesQuery,
      topUsersQuery,
      shotPresetBreakdownQuery,
    ])

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
  const previousUsers = Number((previousUsersRows as Array<{ count: number }>)[0]?.count ?? 0)
  const previousProjects = Number((previousProjectsRows as Array<{ count: number }>)[0]?.count ?? 0)
  const previousSuccessfulGenerations = Number(
    (previousSuccessfulGenerationsRows as Array<{ count: number }>)[0]?.count ?? 0
  )

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
    comparisons: {
      previousWindow: previousFromDate && previousToDate
        ? {
            fromDate: previousFromDate.toISOString(),
            toDate: previousToDate.toISOString(),
          }
        : null,
      users: {
        current: Number(usersRow?.count ?? 0),
        previous: previousUsers,
        pctChange: pctChange(Number(usersRow?.count ?? 0), previousUsers),
      },
      projects: {
        current: Number(projectsRow?.count ?? 0),
        previous: previousProjects,
        pctChange: pctChange(Number(projectsRow?.count ?? 0), previousProjects),
      },
      successfulGenerations: {
        current: successfulGenerations,
        previous: previousSuccessfulGenerations,
        pctChange: pctChange(successfulGenerations, previousSuccessfulGenerations),
      },
      mrr: {
        current: money(mrr),
        previous: null as number | null,
        pctChange: null as number | null,
      },
    },
    charts: {
      daily: (dailySeriesRows as Array<{ day: string; users: number; projects: number; generations: number }>).map((r) => ({
        day: String(r.day),
        users: Number(r.users ?? 0),
        projects: Number(r.projects ?? 0),
        generations: Number(r.generations ?? 0),
      })),
    },
    breakdowns: {
      topUsers: (topUsersRows as Array<{ user_id: string; email: string; project_count: number; generated_count: number }>).map((r) => ({
        userId: r.user_id,
        email: r.email,
        projects: Number(r.project_count ?? 0),
        generated: Number(r.generated_count ?? 0),
      })),
      shotPreset: (shotPresetBreakdownRows as Array<{ shot_type: string; preset: string; total: number; failed: number; done: number }>).map((r) => ({
        shotType: r.shot_type,
        preset: r.preset,
        total: Number(r.total ?? 0),
        done: Number(r.done ?? 0),
        failed: Number(r.failed ?? 0),
        failureRatePct:
          Number(r.total ?? 0) > 0 ? Number(((Number(r.failed ?? 0) / Number(r.total ?? 0)) * 100).toFixed(1)) : 0,
      })),
    },
    meta: {
      generatedAt: new Date().toISOString(),
      cached: false,
    },
  }

  statsResponseCache.set(cacheKey, { expiresAt: now + STATS_CACHE_TTL_MS, payload })
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=30' },
  })
}

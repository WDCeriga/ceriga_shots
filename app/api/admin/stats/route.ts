import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured, db, ensureSchema } from '@/lib/db'
import { findUserById } from '@/lib/users'
import { pricingPlans } from '@/lib/pricing'

export const runtime = 'nodejs'
const ACTIVE_BILLING_STATUSES = ['active', 'trialing', 'past_due'] as const

function money(value: number): number {
  return Number(value.toFixed(2))
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await findUserById(userId)
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Database is not configured (missing DATABASE_URL).' }, { status: 503 })
  }

  await ensureSchema()

  const [usersRow] = (await db`select count(*)::int as count from users`) as Array<{ count: number }>
  const [projectsRow] = (await db`select count(*)::int as count from projects`) as Array<{ count: number }>
  const [jobsQueuedRow] = (await db`select count(*)::int as count from generation_jobs where status = 'queued'`) as Array<{ count: number }>
  const [jobsProcessingRow] = (await db`select count(*)::int as count from generation_jobs where status = 'processing'`) as Array<{ count: number }>
  const [jobsFailedRow] = (await db`select count(*)::int as count from generation_jobs where status = 'failed'`) as Array<{ count: number }>
  const [sharesActiveRow] = (await db`
    select count(*)::int as count
    from project_shares
    where revoked_at is null and (expires_at is null or expires_at > now())
  `) as Array<{ count: number }>
  const paidRows = (await db`
    select role, count(*)::int as count
    from users
    where role in ('starter', 'studio', 'label')
      and stripe_subscription_status = any(${ACTIVE_BILLING_STATUSES}::text[])
    group by role
  `) as Array<{ role: 'starter' | 'studio' | 'label'; count: number }>

  const roleCounts = { starter: 0, studio: 0, label: 0 }
  for (const row of paidRows) {
    roleCounts[row.role] = Number(row.count ?? 0)
  }

  const starterMonthly = pricingPlans.find((p) => p.name === 'Starter')?.monthlyPrice ?? 0
  const studioMonthly = pricingPlans.find((p) => p.name === 'Studio')?.monthlyPrice ?? 0
  const labelMonthly = pricingPlans.find((p) => p.name === 'Label')?.monthlyPrice ?? 0

  const mrr = roleCounts.starter * starterMonthly + roleCounts.studio * studioMonthly + roleCounts.label * labelMonthly
  const activePaidSubscribers = roleCounts.starter + roleCounts.studio + roleCounts.label
  const variableCostPerPaidUser = Number(process.env.FINANCE_COST_PER_ACTIVE_SUBSCRIBER ?? 3)
  const fixedMonthlyCost = Number(process.env.FINANCE_FIXED_MONTHLY_COST ?? 0)
  const estimatedMonthlyCosts = activePaidSubscribers * variableCostPerPaidUser + fixedMonthlyCost
  const grossProfitMonthly = mrr - estimatedMonthlyCosts
  const grossMarginPercent = mrr > 0 ? (grossProfitMonthly / mrr) * 100 : 0

  return NextResponse.json({
    users: Number(usersRow?.count ?? 0),
    projects: Number(projectsRow?.count ?? 0),
    queue: {
      queued: Number(jobsQueuedRow?.count ?? 0),
      processing: Number(jobsProcessingRow?.count ?? 0),
      failed: Number(jobsFailedRow?.count ?? 0),
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
      },
      profitability: {
        grossProfitMonthly: money(grossProfitMonthly),
        grossMarginPercent: money(grossMarginPercent),
      },
    },
  })
}

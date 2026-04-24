import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured, db, ensureSchema } from '@/lib/db'
import { findUserById } from '@/lib/users'
import { computeCreditsInfoForDisplay } from '@/lib/credits'
import type { UserRole } from '@/lib/roles'

export const runtime = 'nodejs'

type GrantTargetRow = {
  id: string
  email: string
  role: string
  credits_used: number
  credits_reset_at: string | null
  stripe_subscription_status: string | null
  label_credits_limit: number | null
}

function normalizeIdentifier(input: unknown): string {
  return typeof input === 'string' ? input.trim() : ''
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const adminUserId = session?.user?.id
  if (!adminUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = await findUserById(adminUserId)
  if (admin?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Database is not configured (missing DATABASE_URL).' }, { status: 503 })
  }

  let body: { user?: unknown; amount?: unknown; reason?: unknown }
  try {
    body = (await req.json()) as { user?: unknown; amount?: unknown; reason?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const identifier = normalizeIdentifier(body.user)
  const amountRaw = body.amount
  const reasonRaw = normalizeIdentifier(body.reason)
  const reason = reasonRaw.length > 500 ? reasonRaw.slice(0, 500) : reasonRaw

  const amount = typeof amountRaw === 'number' ? amountRaw : Number(amountRaw)
  if (!identifier) {
    return NextResponse.json({ error: 'User email or ID is required.' }, { status: 400 })
  }
  if (!Number.isInteger(amount) || amount <= 0 || amount > 5000) {
    return NextResponse.json({ error: 'Amount must be an integer between 1 and 5000.' }, { status: 400 })
  }

  await ensureSchema()

  const targets = (await db`
    select id, email, role, credits_used, credits_reset_at, stripe_subscription_status, label_credits_limit
    from users
    where id::text = ${identifier}
       or lower(email) = lower(${identifier})
    order by created_at desc
    limit 1
  `) as GrantTargetRow[]
  const target = targets[0]
  if (!target) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 })
  }

  const beforeUsed = Number(target.credits_used ?? 0)
  const updatedRows = (await db`
    update users
    set credits_used = credits_used - ${amount}
    where id = ${target.id}
    returning credits_used
  `) as Array<{ credits_used: number }>
  const updated = updatedRows[0]
  if (!updated) {
    return NextResponse.json({ error: 'Failed to grant credits.' }, { status: 500 })
  }
  const afterUsed = Number(updated.credits_used ?? 0)

  await db`
    insert into credit_grants (
      admin_user_id,
      target_user_id,
      amount,
      reason,
      before_credits_used,
      after_credits_used
    ) values (
      ${adminUserId},
      ${target.id},
      ${amount},
      ${reason || null},
      ${beforeUsed},
      ${afterUsed}
    )
  `

  const role = target.role as UserRole
  const beforeCredits = computeCreditsInfoForDisplay(
    role,
    beforeUsed,
    target.credits_reset_at,
    target.stripe_subscription_status,
    target.label_credits_limit
  )
  const afterCredits = computeCreditsInfoForDisplay(
    role,
    afterUsed,
    target.credits_reset_at,
    target.stripe_subscription_status,
    target.label_credits_limit
  )

  return NextResponse.json({
    ok: true,
    grant: {
      userId: target.id,
      email: target.email,
      amount,
      reason: reason || null,
      before: {
        used: beforeCredits.used,
        limit: beforeCredits.limit,
        remaining: beforeCredits.remaining,
      },
      after: {
        used: afterCredits.used,
        limit: afterCredits.limit,
        remaining: afterCredits.remaining,
      },
    },
  })
}

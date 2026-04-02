import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured, db, ensureSchema } from '@/lib/db'
import { findUserById } from '@/lib/users'

export const runtime = 'nodejs'

type GrantRow = {
  id: string
  admin_user_id: string
  target_user_id: string
  amount: number
  reason: string | null
  before_credits_used: number
  after_credits_used: number
  created_at: string
  admin_email: string | null
  target_email: string | null
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
  const limitRaw = Number(url.searchParams.get('limit') ?? 50)
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 50

  const rows = (await db`
    select
      g.id,
      g.admin_user_id,
      g.target_user_id,
      g.amount,
      g.reason,
      g.before_credits_used,
      g.after_credits_used,
      g.created_at,
      a.email as admin_email,
      t.email as target_email
    from credit_grants g
    left join users a on a.id = g.admin_user_id::uuid
    left join users t on t.id = g.target_user_id::uuid
    order by g.created_at desc
    limit ${limit}
  `) as GrantRow[]

  return NextResponse.json({
    grants: rows.map((r) => ({
      id: r.id,
      adminUserId: r.admin_user_id,
      adminEmail: r.admin_email,
      targetUserId: r.target_user_id,
      targetEmail: r.target_email,
      amount: Number(r.amount ?? 0),
      reason: r.reason,
      beforeCreditsUsed: Number(r.before_credits_used ?? 0),
      afterCreditsUsed: Number(r.after_credits_used ?? 0),
      createdAt: r.created_at,
    })),
  })
}

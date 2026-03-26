import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured, db, ensureSchema } from '@/lib/db'
import { computeCreditsInfoForDisplay } from '@/lib/credits'
import { findUserById } from '@/lib/users'
import type { UserRole } from '@/lib/roles'

export const runtime = 'nodejs'

type Row = {
  id: string
  email: string
  role: string
  created_at: string
  credits_used: number
  credits_reset_at: string | null
  project_count: number
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

  const rows = (await db`
    select
      u.id,
      u.email,
      u.role,
      u.created_at,
      u.credits_used,
      u.credits_reset_at,
      (select count(*)::int from projects pr where pr.owner_id = u.id::text) as project_count
    from users u
    order by u.created_at desc
    limit 200
  `) as Row[]

  return NextResponse.json({
    users: rows.map((r) => {
      const role = r.role as UserRole
      const credits = computeCreditsInfoForDisplay(role, r.credits_used, r.credits_reset_at)
      const unlimited = credits.limit < 0
      return {
        id: r.id,
        email: r.email,
        role: r.role,
        createdAt: r.created_at,
        projectCount: Number(r.project_count ?? 0),
        credits: {
          used: credits.used,
          limit: unlimited ? null : credits.limit,
          remaining: unlimited ? null : credits.remaining,
          unlimited,
          resetAt: credits.resetAt ? credits.resetAt.toISOString() : null,
        },
      }
    }),
  })
}

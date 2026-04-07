import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured, db, ensureSchema } from '@/lib/db'
import { computeCreditsInfoForDisplay } from '@/lib/credits'
import { findUserById, updateUserRole } from '@/lib/users'
import { isValidRole, type UserRole } from '@/lib/roles'

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

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  const actorUserId = session?.user?.id
  if (!actorUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const actor = await findUserById(actorUserId)
  if (actor?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Database is not configured (missing DATABASE_URL).' }, { status: 503 })
  }
  await ensureSchema()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const userId = (body as { userId?: unknown }).userId
  const role = (body as { role?: unknown }).role
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }
  if (!isValidRole(role)) {
    return NextResponse.json({ error: 'role is invalid' }, { status: 400 })
  }
  if (role === 'admin') {
    return NextResponse.json({ error: 'Assigning admin role is not allowed from this endpoint.' }, { status: 403 })
  }
  if (userId === actorUserId) {
    return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 400 })
  }

  const updated = await updateUserRole(userId, role)
  if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  return NextResponse.json({
    user: {
      id: updated.id,
      role: updated.role,
    },
  })
}

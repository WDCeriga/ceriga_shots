import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured, db, ensureSchema } from '@/lib/db'
import { findUserById } from '@/lib/users'

export const runtime = 'nodejs'

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
  })
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured, db, ensureSchema } from '@/lib/db'
import { findUserById } from '@/lib/users'

export const runtime = 'nodejs'

type Row = {
  id: string
  owner_id: string
  project_id: string
  shot_type: string
  preset: string
  status: string
  attempts: number
  model_calls: number
  max_attempts: number
  error_message: string | null
  created_at: string
  updated_at: string
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
      id,
      owner_id,
      project_id,
      shot_type,
      preset,
      status,
      attempts,
      model_calls,
      max_attempts,
      error_message,
      created_at,
      updated_at
    from generation_jobs
    order by created_at desc
    limit 300
  `) as Row[]

  return NextResponse.json({
    jobs: rows.map((r) => ({
      id: r.id,
      ownerId: r.owner_id,
      projectId: r.project_id,
      shotType: r.shot_type,
      preset: r.preset,
      status: r.status,
      attempts: Number(r.attempts),
      modelCalls: Number(r.model_calls ?? 0),
      maxAttempts: Number(r.max_attempts),
      errorMessage: r.error_message,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  })
}

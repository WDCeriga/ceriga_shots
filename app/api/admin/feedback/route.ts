import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { findUserById } from '@/lib/users'
import { db, ensureSchema, isDatabaseConfigured } from '@/lib/db'

export const runtime = 'nodejs'

type FeedbackRow = {
  id: string
  user_id: string | null
  user_email: string | null
  page_path: string | null
  message: string
  created_at: string
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
    select id, user_id, user_email, page_path, message, created_at
    from user_feedback
    order by created_at desc
    limit 300
  `) as FeedbackRow[]

  return NextResponse.json({
    feedback: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      userEmail: r.user_email,
      pagePath: r.page_path,
      message: r.message,
      createdAt: r.created_at,
    })),
  })
}

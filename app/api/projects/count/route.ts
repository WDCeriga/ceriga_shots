import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured } from '@/lib/db'
import { getProjectsCountForUser } from '@/lib/projects'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: 'Database is not configured (missing DATABASE_URL).' },
      { status: 503 }
    )
  }

  try {
    const count = await getProjectsCountForUser(session.user.id)
    return NextResponse.json(
      { count },
      { headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=30' } }
    )
  } catch (error) {
    console.error('GET /api/projects/count error', error)
    return NextResponse.json({ error: 'Failed to load project count' }, { status: 500 })
  }
}

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured } from '@/lib/db'
import { getProjectGenerationStatusForUser } from '@/lib/projects'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url)
  const id = url.pathname.split('/').at(-2) as string
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
    const status = await getProjectGenerationStatusForUser(session.user.id, id)
    if (!status) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ status })
  } catch (error) {
    console.error('GET /api/projects/[id]/status error', error)
    return NextResponse.json({ error: 'Failed to load generation status' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured } from '@/lib/db'
import { getProjectForUser } from '@/lib/projects'
import { listSharesForProject } from '@/lib/shares'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const id = url.pathname.split('/').slice(-2)[0] as string
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

  const project = await getProjectForUser(session.user.id, id)
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const base =
    process.env.NEXT_PUBLIC_SITE_URL && process.env.NEXT_PUBLIC_SITE_URL.length
      ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
      : url.origin

  const shares = await listSharesForProject(id, session.user.id, base)
  return NextResponse.json({ shares })
}

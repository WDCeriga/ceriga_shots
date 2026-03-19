import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured } from '@/lib/db'
import { getProjectForUser } from '@/lib/projects'
import { createShareForProject } from '@/lib/shares'
import { applyRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
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

  const shareRate = await applyRateLimit({
    key: `rl:share:create:user:${session.user.id}`,
    limit: 10,
    windowSeconds: 60,
  })
  if (!shareRate.ok) {
    return NextResponse.json(
      { error: `Too many share link requests. Try again in ${shareRate.retryAfterSeconds}s.` },
      {
        status: 429,
        headers: { 'Retry-After': String(shareRate.retryAfterSeconds) },
      }
    )
  }

  const project = await getProjectForUser(session.user.id, id)
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let expiresAt: Date | null | undefined
  try {
    const body = (await req.json().catch(() => ({}))) as { expiresAt?: string | null }
    expiresAt = body.expiresAt
      ? new Date(body.expiresAt)
      : undefined
  } catch {
    expiresAt = undefined
  }

  const token = await createShareForProject(session.user.id, id, {
    expiresAt: expiresAt ?? undefined,
  })

  const base =
    process.env.NEXT_PUBLIC_SITE_URL && process.env.NEXT_PUBLIC_SITE_URL.length
      ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
      : url.origin

  const shareUrl = `${base}/share/${token}`

  return NextResponse.json({ token, shareUrl })
}


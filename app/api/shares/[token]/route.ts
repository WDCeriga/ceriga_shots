import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured } from '@/lib/db'
import { getProjectForShareToken, revokeShare } from '@/lib/shares'

export const runtime = 'nodejs'

function getTokenFromPath(pathname: string): string {
  return pathname.split('/').pop() as string
}

export async function GET(_req: Request) {
  const url = new URL(_req.url)
  const token = getTokenFromPath(url.pathname)

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: 'Database is not configured (missing DATABASE_URL).' },
      { status: 503 }
    )
  }

  const project = await getProjectForShareToken(token)
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      originalImage: project.originalImage,
      originalImageName: project.originalImageName,
      generatedImages: project.generatedImages,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
  })
}

export async function PATCH(req: Request) {
  const url = new URL(req.url)
  const token = getTokenFromPath(url.pathname)
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

  let body: { action?: string }
  try {
    body = (await req.json().catch(() => ({}))) as { action?: string }
  } catch {
    body = {}
  }

  if (body.action === 'revoke') {
    const ok = await revokeShare(token, session.user.id)
    if (!ok) {
      return NextResponse.json(
        { error: 'Share not found or already revoked' },
        { status: 404 }
      )
    }
    return NextResponse.json({ revoked: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}


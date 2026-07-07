import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured } from '@/lib/db'
import { getProjectForUser, removeGeneratedImageForUser } from '@/lib/projects'

export const runtime = 'nodejs'

export async function DELETE(_req: NextRequest) {
  const url = new URL(_req.url)
  const segments = url.pathname.split('/')
  const assetId = segments.at(-1) as string
  const projectId = segments.at(-3) as string

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!projectId || !assetId) {
    return NextResponse.json({ error: 'Invalid route params' }, { status: 400 })
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: 'Database is not configured (missing DATABASE_URL).' },
      { status: 503 }
    )
  }

  const existing = await getProjectForUser(session.user.id, projectId)
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const hasAsset = (existing.generatedImages ?? []).some((img) => img.id === assetId)
  if (!hasAsset) {
    return NextResponse.json({ error: 'Asset not found in this project' }, { status: 404 })
  }

  const project = await removeGeneratedImageForUser(session.user.id, projectId, assetId)
  if (!project) {
    return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 })
  }

  return NextResponse.json({ project })
}

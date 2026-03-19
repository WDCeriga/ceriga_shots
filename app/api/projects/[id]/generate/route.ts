import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured } from '@/lib/db'
import { getProjectForUser } from '@/lib/projects'
import { enqueueGenerationJobs, type Preset, type ShotType } from '@/lib/generation-queue'

const SHOT_TYPES: ShotType[] = [
  'flatlay_topdown',
  'flatlay_45deg',
  'flatlay_sleeves',
  'flatlay_relaxed',
  'flatlay_folded',
  'surface_draped',
  'surface_hanging',
  'detail_print',
  'detail_fabric',
  'detail_collar',
]

const PRESETS: Preset[] = ['raw', 'editorial', 'luxury', 'natural', 'studio', 'surprise']

function isShotType(v: unknown): v is ShotType {
  return typeof v === 'string' && SHOT_TYPES.includes(v as ShotType)
}

function isPreset(v: unknown): v is Preset {
  return typeof v === 'string' && PRESETS.includes(v as Preset)
}

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
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

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rawShotTypes = (body as { shotTypes?: unknown }).shotTypes
  const rawPreset = (body as { preset?: unknown }).preset

  if (!Array.isArray(rawShotTypes) || rawShotTypes.length === 0) {
    return NextResponse.json({ error: 'shotTypes must be a non-empty array' }, { status: 400 })
  }
  if (!rawShotTypes.every(isShotType)) {
    return NextResponse.json({ error: 'shotTypes contains invalid values' }, { status: 400 })
  }
  if (!isPreset(rawPreset)) {
    return NextResponse.json({ error: 'preset is invalid' }, { status: 400 })
  }

  const project = await getProjectForUser(session.user.id, id)
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await enqueueGenerationJobs({
    ownerId: session.user.id,
    projectId: project.id,
    shotTypes: rawShotTypes,
    preset: rawPreset,
  })

  const baseUrl = `${url.protocol}//${url.host}`
  const dispatchHeaders: Record<string, string> = {}
  if (process.env.QUEUE_DISPATCH_SECRET) {
    dispatchHeaders['x-queue-secret'] = process.env.QUEUE_DISPATCH_SECRET
  } else if (process.env.CRON_SECRET) {
    dispatchHeaders['authorization'] = `Bearer ${process.env.CRON_SECRET}`
  }
  void fetch(`${baseUrl}/api/jobs/dispatch`, {
    method: 'POST',
    headers: dispatchHeaders,
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}

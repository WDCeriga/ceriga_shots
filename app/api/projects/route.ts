import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createProjectForUser, getProjectsForUser } from '@/lib/projects'
import type { Project } from '@/hooks/use-projects'
import { isDatabaseConfigured } from '@/lib/db'
import { isR2Configured, putObjectToR2 } from '@/lib/r2'
import { enqueueGenerationJobs, type Preset, type ShotType } from '@/lib/generation-queue'

const ALLOWED_SHOT_TYPES = new Set<ShotType>([
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
])

function parseDataUrl(dataUrl: string): { mime: string; base64: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!match) return null
  return { mime: match[1]!, base64: match[2]! }
}

function extFromMime(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/heic':
      return 'heic'
    case 'image/heif':
      return 'heif'
    default:
      return 'bin'
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({
      projects: [],
      warning: 'Database is not configured (missing DATABASE_URL).',
    })
  }

  try {
    const projects = await getProjectsForUser(session.user.id)
    return NextResponse.json({ projects })
  } catch (error) {
    console.error('GET /api/projects error', error)
    return NextResponse.json({ error: 'Failed to load projects' }, { status: 500 })
  }
}

export async function POST(req: Request) {
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

  const input = body as Omit<Project, 'id' | 'createdAt' | 'updatedAt'>

  if (!input.name || !input.originalImage || !input.originalImageName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    let originalImage = input.originalImage
    if (isR2Configured()) {
      const parsed = parseDataUrl(input.originalImage)
      if (parsed) {
        const bytes = Buffer.from(parsed.base64, 'base64')
        const ext = extFromMime(parsed.mime)
        const safeBase = (input.originalImageName || 'original').replace(/\.[^/.]+$/, '')
        const key =
          `users/${session.user.id}/original/` +
          `${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now()}-${safeBase}.${ext}`
        const uploaded = await putObjectToR2({ key, body: bytes, contentType: parsed.mime })
        originalImage = uploaded.url
      }
    }

    const project = await createProjectForUser(session.user.id, {
      ...input,
      originalImage,
      generatedImages: input.generatedImages ?? [],
    })

    const shotTypes = (input.generation?.shotTypes ?? []).filter(
      (s): s is ShotType => typeof s === 'string' && ALLOWED_SHOT_TYPES.has(s as ShotType)
    )
    const preset = (input.generation?.preset ?? 'raw') as Preset
    if (input.generation?.status === 'generating' && shotTypes.length > 0) {
      await enqueueGenerationJobs({
        ownerId: session.user.id,
        projectId: project.id,
        shotTypes,
        preset,
      })
      const origin = new URL(req.url).origin
      const dispatchHeaders: Record<string, string> = {}
      if (process.env.QUEUE_DISPATCH_SECRET) {
        dispatchHeaders['x-queue-secret'] = process.env.QUEUE_DISPATCH_SECRET
      } else if (process.env.CRON_SECRET) {
        dispatchHeaders['authorization'] = `Bearer ${process.env.CRON_SECRET}`
      }
      void fetch(`${origin}/api/jobs/dispatch`, {
        method: 'POST',
        headers: dispatchHeaders,
      }).catch(() => {})
    }

    return NextResponse.json({ project }, { status: 201 })
  } catch (error) {
    console.error('POST /api/projects error', error)
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}


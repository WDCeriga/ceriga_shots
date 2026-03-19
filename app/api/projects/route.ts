import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createProjectForUser, getProjectsForUser } from '@/lib/projects'
import type { Project } from '@/hooks/use-projects'
import { isDatabaseConfigured } from '@/lib/db'
import { isR2Configured, putObjectToR2 } from '@/lib/r2'
import { enqueueGenerationJobs, type Preset, type ShotType } from '@/lib/generation-queue'
import {
  checkProjectLimit,
  validateShotTypesForRole,
  validatePresetForRole,
  type QuotaError,
} from '@/lib/quotas'
import { findUserById } from '@/lib/users'
import type { UserRole } from '@/lib/roles'
import { decrementCredits, incrementCredits, getCreditsForUser } from '@/lib/credits'
import { applyAssetRetentionToProject } from '@/lib/asset-retention'
import { updateProjectForUser } from '@/lib/projects'

function quotaErrorMessage(err: QuotaError): string {
  switch (err.code) {
    case 'max_projects':
      return `Project limit reached (${err.limit}). Upgrade to add more projects.`
    case 'insufficient_credits':
      return `Insufficient credits. Need ${err.required}, have ${err.remaining} remaining.`
    case 'shot_type_not_allowed':
      return `Shot type "${err.shotType}" is not available on your plan.`
    case 'preset_not_allowed':
      return `Preset "${err.preset}" is not available on your plan.`
    case 'generate_more_disabled':
      return 'Generate more is not available on the free plan.'
    default:
      return 'Quota exceeded.'
  }
}

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
    const user = await findUserById(session.user.id)
    const role = (user?.role ?? 'free') as UserRole
    const projects = await getProjectsForUser(session.user.id)
    const now = Date.now()
    const hydrated = await Promise.all(
      projects.map(async (project) => {
        const retained = applyAssetRetentionToProject(project, role, now)
        if (!retained.changed) return project
        const persisted = await updateProjectForUser(session.user.id, project.id, {
          generatedImages: retained.project.generatedImages,
        })
        return persisted ?? retained.project
      })
    )
    return NextResponse.json({ projects: hydrated })
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

  const user = await findUserById(session.user.id)
  const role = (user?.role ?? 'free') as UserRole

  const projectLimitErr = await checkProjectLimit(session.user.id, role)
  if (projectLimitErr) {
    return NextResponse.json(
      {
        error: quotaErrorMessage(projectLimitErr),
        code: projectLimitErr.code,
      },
      { status: 403 }
    )
  }

  const shotTypes = (input.generation?.shotTypes ?? []).filter(
    (s): s is ShotType => typeof s === 'string' && ALLOWED_SHOT_TYPES.has(s as ShotType)
  )
  const preset = (input.generation?.preset ?? 'raw') as Preset

  if (shotTypes.length > 0) {
    const credits = await getCreditsForUser(session.user.id)
    if (!credits || credits.remaining < shotTypes.length) {
      return NextResponse.json(
        {
          error: quotaErrorMessage({
            code: 'insufficient_credits',
            required: shotTypes.length,
            remaining: credits?.remaining ?? 0,
          }),
          code: 'insufficient_credits',
        },
        { status: 403 }
      )
    }
    const shotErr = validateShotTypesForRole(role, shotTypes)
    if (shotErr) {
      return NextResponse.json(
        { error: quotaErrorMessage(shotErr), code: shotErr.code },
        { status: 403 }
      )
    }
    const presetErr = validatePresetForRole(role, preset)
    if (presetErr) {
      return NextResponse.json(
        { error: quotaErrorMessage(presetErr), code: presetErr.code },
        { status: 403 }
      )
    }
  }

  const shouldQueueInitial = input.generation?.status === 'generating' && shotTypes.length > 0
  let reservedCredits = false
  if (shouldQueueInitial) {
    reservedCredits = await decrementCredits(session.user.id, shotTypes.length)
    if (!reservedCredits) {
      const credits = await getCreditsForUser(session.user.id)
      return NextResponse.json(
        {
          error: quotaErrorMessage({
            code: 'insufficient_credits',
            required: shotTypes.length,
            remaining: credits?.remaining ?? 0,
          }),
          code: 'insufficient_credits',
        },
        { status: 403 }
      )
    }
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

    if (shouldQueueInitial) {
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
    if (reservedCredits) {
      await incrementCredits(session.user.id, shotTypes.length)
    }
    console.error('POST /api/projects error', error)
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}


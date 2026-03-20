import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured } from '@/lib/db'
import { getProjectForUser } from '@/lib/projects'
import { enqueueGenerationJobs, type Preset, type ShotType } from '@/lib/generation-queue'
import {
  checkCreditsForBatch,
  validateShotTypesForRole,
  validatePresetForRole,
  checkGenerateMore,
  type QuotaError,
} from '@/lib/quotas'
import { findUserById } from '@/lib/users'
import type { UserRole } from '@/lib/roles'
import { decrementCredits, incrementCredits } from '@/lib/credits'
import { applyRateLimit } from '@/lib/rate-limit'

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

function isShotType(v: unknown): v is ShotType {
  return typeof v === 'string' && SHOT_TYPES.includes(v as ShotType)
}

function isPreset(v: unknown): v is Preset {
  return typeof v === 'string' && PRESETS.includes(v as Preset)
}

function normalizeGarmentType(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  const cleaned = input.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return undefined
  return cleaned.length > 50 ? cleaned.slice(0, 50).trim() : cleaned
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
  const modeRaw = (body as { mode?: unknown }).mode
  const mode: 'initial' | 'more' = modeRaw === 'initial' ? 'initial' : 'more'
  const garmentType = normalizeGarmentType((body as { garmentType?: unknown }).garmentType)

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

  const userRate = await applyRateLimit({
    key: `rl:generate:user:${session.user.id}`,
    limit: 10,
    windowSeconds: 60,
  })
  if (!userRate.ok) {
    return NextResponse.json(
      { error: `Too many generation requests. Try again in ${userRate.retryAfterSeconds}s.` },
      {
        status: 429,
        headers: { 'Retry-After': String(userRate.retryAfterSeconds) },
      }
    )
  }

  const projectRate = await applyRateLimit({
    key: `rl:generate:project:${session.user.id}:${id}`,
    limit: 4,
    windowSeconds: 60,
  })
  if (!projectRate.ok) {
    return NextResponse.json(
      { error: `Too many generation requests for this project. Try again in ${projectRate.retryAfterSeconds}s.` },
      {
        status: 429,
        headers: { 'Retry-After': String(projectRate.retryAfterSeconds) },
      }
    )
  }

  const user = await findUserById(session.user.id)
  const role = (user?.role ?? 'free') as UserRole

  if (!user?.email_verified) {
    return NextResponse.json(
      { error: 'Please verify your email before generating.', code: 'email_not_verified' },
      { status: 403 }
    )
  }

  const generateMoreErr = mode === 'more' ? checkGenerateMore(role) : null
  if (generateMoreErr) {
    return NextResponse.json(
      { error: quotaErrorMessage(generateMoreErr), code: generateMoreErr.code },
      { status: 403 }
    )
  }

  const creditsErr = await checkCreditsForBatch(session.user.id, rawShotTypes.length)
  if (creditsErr) {
    return NextResponse.json(
      { error: quotaErrorMessage(creditsErr), code: creditsErr.code },
      { status: 403 }
    )
  }

  const shotErr = validateShotTypesForRole(role, rawShotTypes)
  if (shotErr) {
    return NextResponse.json(
      { error: quotaErrorMessage(shotErr), code: shotErr.code },
      { status: 403 }
    )
  }

  const presetErr = validatePresetForRole(role, rawPreset)
  if (presetErr) {
    return NextResponse.json(
      { error: quotaErrorMessage(presetErr), code: presetErr.code },
      { status: 403 }
    )
  }

  const creditsOk = await decrementCredits(session.user.id, rawShotTypes.length)
  if (!creditsOk) {
    const latestErr = await checkCreditsForBatch(session.user.id, rawShotTypes.length)
    return NextResponse.json(
      {
        error: quotaErrorMessage(
          latestErr ?? {
            code: 'insufficient_credits',
            required: rawShotTypes.length,
            remaining: 0,
          }
        ),
        code: 'insufficient_credits',
      },
      { status: 403 }
    )
  }

  try {
    await enqueueGenerationJobs({
      ownerId: session.user.id,
      projectId: project.id,
      shotTypes: rawShotTypes,
      preset: rawPreset,
      garmentType,
    })

    const baseUrl = `${url.protocol}//${url.host}`
    const dispatchHeaders: Record<string, string> = {}
    if (process.env.QUEUE_DISPATCH_SECRET) {
      dispatchHeaders['x-queue-secret'] = process.env.QUEUE_DISPATCH_SECRET
    } else if (process.env.CRON_SECRET) {
      dispatchHeaders['authorization'] = `Bearer ${process.env.CRON_SECRET}`
    } else {
      // Forward session cookie so /api/jobs/dispatch can authorize via getServerSession.
      const cookie = req.headers.get('cookie')
      if (cookie) dispatchHeaders.cookie = cookie
    }
    void fetch(`${baseUrl}/api/jobs/dispatch`, {
      method: 'POST',
      headers: dispatchHeaders,
    })
      .then((res) => {
        if (!res.ok) {
          console.warn(`Dispatch request returned ${res.status}`)
        }
      })
      .catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (error) {
    await incrementCredits(session.user.id, rawShotTypes.length)
    console.error('POST /api/projects/[id]/generate error', error)
    return NextResponse.json({ error: 'Failed to enqueue generation' }, { status: 500 })
  }
}

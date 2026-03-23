import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured } from '@/lib/db'
import { getProjectAssetTypeForUser, getProjectGenerationContextForUser } from '@/lib/projects'
import { enqueueGenerationJobs, type Preset, type ShotType } from '@/lib/generation-queue'
import {
  checkCreditsForBatch,
  validatePresetForRole,
  validateShotTypesForRole,
  type QuotaError,
} from '@/lib/quotas'
import { applyRateLimit } from '@/lib/rate-limit'
import { findUserById } from '@/lib/users'
import type { UserRole } from '@/lib/roles'
import { decrementCredits, incrementCredits } from '@/lib/credits'

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

function normalizeEditChanges(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const cleaned = input.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return null
  // Hard clamp to keep prompts safe and predictable.
  return cleaned.length > 800 ? cleaned.slice(0, 800).trim() : cleaned
}

function normalizeShotTypeForEdit(type: string): ShotType | null {
  // Support legacy types stored in older projects.
  switch (type) {
    case 'flat-lay':
      return 'flatlay_topdown'
    case 'product-shot':
      return 'surface_hanging'
    case 'lifestyle':
      return 'surface_draped'
    case 'detail':
      return 'detail_print'
    case 'flatlay_topdown':
    case 'flatlay_45deg':
    case 'flatlay_sleeves':
    case 'flatlay_relaxed':
    case 'flatlay_folded':
    case 'surface_draped':
    case 'surface_hanging':
    case 'detail_print':
    case 'detail_fabric':
    case 'detail_collar':
      return type
    default:
      return null
  }
}

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const projectId = url.pathname.split('/').at(-4) as string
  const assetId = url.pathname.split('/').at(-2) as string

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!projectId || !assetId) {
    return NextResponse.json({ error: 'Invalid route params' }, { status: 400 })
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Database is not configured (missing DATABASE_URL).' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const changes = normalizeEditChanges((body as { changes?: unknown }).changes)
  if (!changes) {
    return NextResponse.json({ error: 'changes must be a non-empty string' }, { status: 400 })
  }

  const project = await getProjectGenerationContextForUser(session.user.id, projectId)
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const assetType = await getProjectAssetTypeForUser(session.user.id, projectId, assetId)
  if (!assetType) {
    return NextResponse.json({ error: 'Asset not found in this project' }, { status: 404 })
  }

  const shotType = normalizeShotTypeForEdit(assetType)
  if (!shotType) {
    return NextResponse.json({ error: 'Unsupported asset type' }, { status: 400 })
  }

  const user = await findUserById(session.user.id)
  const role = (user?.role ?? 'free') as UserRole

  const canImageEditing = role === 'studio' || role === 'label' || role === 'admin'
  if (!canImageEditing) {
    return NextResponse.json(
      { error: 'Image editing is only available on Studio and above.', code: 'image_editing_disabled' },
      { status: 403 }
    )
  }

  const userRate = await applyRateLimit({
    key: `rl:edit:user:${session.user.id}`,
    limit: 10,
    windowSeconds: 60,
  })
  if (!userRate.ok) {
    return NextResponse.json(
      { error: `Too many edit requests. Try again in ${userRate.retryAfterSeconds}s.` },
      { status: 429, headers: { 'Retry-After': String(userRate.retryAfterSeconds) } }
    )
  }

  const projectRate = await applyRateLimit({
    key: `rl:edit:project:${session.user.id}:${projectId}`,
    limit: 4,
    windowSeconds: 60,
  })
  if (!projectRate.ok) {
    return NextResponse.json(
      { error: `Too many edit requests for this project. Try again in ${projectRate.retryAfterSeconds}s.` },
      { status: 429, headers: { 'Retry-After': String(projectRate.retryAfterSeconds) } }
    )
  }

  const creditsErr = await checkCreditsForBatch(session.user.id, 1)
  if (creditsErr) {
    return NextResponse.json({ error: quotaErrorMessage(creditsErr), code: creditsErr.code }, { status: 403 })
  }

  const shotErr = validateShotTypesForRole(role, [shotType])
  if (shotErr) {
    return NextResponse.json({ error: quotaErrorMessage(shotErr), code: shotErr.code }, { status: 403 })
  }

  const presetRaw = project.generation?.preset ?? 'raw'
  const preset = presetRaw as Preset
  const presetErr = validatePresetForRole(role, preset)
  if (presetErr) {
    return NextResponse.json({ error: quotaErrorMessage(presetErr), code: presetErr.code }, { status: 403 })
  }

  const creditsOk = await decrementCredits(session.user.id, 1)
  if (!creditsOk) {
    const latestErr = await checkCreditsForBatch(session.user.id, 1)
    return NextResponse.json(
      {
        error: quotaErrorMessage(
          latestErr ?? {
            code: 'insufficient_credits',
            required: 1,
            remaining: 0,
          }
        ),
        code: 'insufficient_credits',
      },
      { status: 403 }
    )
  }

  try {
    const editorBrandName = user?.brand_name ?? null

    await enqueueGenerationJobs({
      ownerId: session.user.id,
      projectId: project.id,
      shotTypes: [shotType],
      preset,
      garmentType: project.generation?.garmentType,
      editInstructions: changes,
      editedFromId: assetId,
      editorBrandName,
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
    }).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (error) {
    await incrementCredits(session.user.id, 1)
    console.error('POST /api/projects/[id]/assets/[assetId]/edit error', error)
    return NextResponse.json({ error: 'Failed to enqueue edit generation' }, { status: 500 })
  }
}


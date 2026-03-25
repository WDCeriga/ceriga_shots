import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured } from '@/lib/db'
import { getProjectForUser, updateProjectForUser } from '@/lib/projects'
import { mergeGeneration } from '@/lib/merge-generation'
import type { GeneratedImage } from '@/types/projects'
import { findUserById } from '@/lib/users'
import { checkCreditsForBatch } from '@/lib/quotas'
import { decrementCredits, incrementCredits } from '@/lib/credits'
import { applyRateLimit } from '@/lib/rate-limit'
import { isR2Configured, putObjectToR2 } from '@/lib/r2'

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
    default:
      return 'png'
  }
}

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const id = url.pathname.split('/').at(-2) as string
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const ownerId = session.user.id

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

  const resultDataUrl = (body as { resultDataUrl?: unknown }).resultDataUrl
  if (typeof resultDataUrl !== 'string' || resultDataUrl.length < 64) {
    return NextResponse.json({ error: 'resultDataUrl must be a non-empty base64 data URL' }, { status: 400 })
  }

  const parsed = parseDataUrl(resultDataUrl)
  if (!parsed) {
    return NextResponse.json({ error: 'resultDataUrl must be a valid data URL' }, { status: 400 })
  }
  if (!parsed.mime.startsWith('image/')) {
    return NextResponse.json({ error: 'result must be an image data URL' }, { status: 400 })
  }

  const project = await getProjectForUser(ownerId, id)
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (project.generation?.pipeline !== 'background_remove') {
    return NextResponse.json(
      { error: 'Project is not in background removal mode' },
      { status: 400 }
    )
  }

  const alreadyDone = (project.generatedImages ?? []).some((img) => img.type === 'background_remove')
  if (alreadyDone) {
    return NextResponse.json({ error: 'Background removal already completed for this project' }, { status: 409 })
  }

  const user = await findUserById(ownerId)
  if (!user?.email_verified) {
    return NextResponse.json(
      { error: 'Please verify your email before saving results.', code: 'email_not_verified' },
      { status: 403 }
    )
  }

  const userRate = await applyRateLimit({
    key: `rl:bgremove:user:${ownerId}`,
    limit: 8,
    windowSeconds: 60,
  })
  if (!userRate.ok) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${userRate.retryAfterSeconds}s.` },
      { status: 429, headers: { 'Retry-After': String(userRate.retryAfterSeconds) } }
    )
  }

  const creditsErr = await checkCreditsForBatch(ownerId, 1)
  if (creditsErr) {
    return NextResponse.json(
      {
        error:
          creditsErr.code === 'insufficient_credits'
            ? `Insufficient credits. Need 1, have ${creditsErr.remaining} remaining.`
            : 'Quota exceeded.',
        code: creditsErr.code,
      },
      { status: 403 }
    )
  }

  const creditsOk = await decrementCredits(ownerId, 1)
  if (!creditsOk) {
    return NextResponse.json(
      { error: 'Insufficient credits', code: 'insufficient_credits' },
      { status: 403 }
    )
  }

  try {
    let finalUrl = resultDataUrl
    const bytes = Buffer.from(parsed.base64, 'base64')
    if (bytes.length > 18 * 1024 * 1024) {
      await incrementCredits(ownerId, 1)
      return NextResponse.json({ error: 'Image is too large' }, { status: 400 })
    }

    if (isR2Configured()) {
      const ext = extFromMime(parsed.mime)
      const key =
        `users/${ownerId}/generated/` +
        `${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now()}-background-remove.${ext}`
      const uploaded = await putObjectToR2({ key, body: bytes, contentType: parsed.mime })
      finalUrl = uploaded.url
    } else if (process.env.NODE_ENV !== 'development') {
      await incrementCredits(ownerId, 1)
      return NextResponse.json(
        {
          error:
            'Image storage is not configured. Configure R2 before saving background removal in production.',
        },
        { status: 503 }
      )
    }

    const newImage: GeneratedImage = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`,
      type: 'background_remove',
      url: finalUrl,
      timestamp: Date.now(),
      meta: {
        shotType: 'background_remove',
        preset: project.generation?.preset ?? 'studio',
        generationIndex: 1,
        variationSeed: 1,
        pipeline: 'background_remove',
      },
    }

    const nextGen = mergeGeneration(project.generation, {
      status: 'complete',
      total: 1,
      completed: 1,
      pipeline: 'background_remove',
      preset: project.generation?.preset ?? 'studio',
      nextType: undefined,
      errorMessage: undefined,
    })

    const updated = await updateProjectForUser(ownerId, id, {
      generatedImages: [...(project.generatedImages ?? []), newImage],
      generation: nextGen,
    })

    if (!updated) {
      await incrementCredits(ownerId, 1)
      return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
    }

    return NextResponse.json({ project: updated })
  } catch (e) {
    await incrementCredits(ownerId, 1)
    console.error('POST /api/projects/[id]/background-remove error', e)
    return NextResponse.json({ error: 'Failed to save background removal' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured } from '@/lib/db'
import {
  addGenerationJobModelCalls,
  claimNextGenerationJob,
  completeGenerationJob,
  failGenerationJob,
} from '@/lib/generation-queue'
import { getProjectForUser, updateProjectForUser } from '@/lib/projects'
import { incrementCredits } from '@/lib/credits'
import type { GeneratedImage } from '@/types/projects'

export const runtime = 'nodejs'

function canRunWithSecret(req: Request) {
  const explicit = process.env.QUEUE_DISPATCH_SECRET
  if (explicit && req.headers.get('x-queue-secret') === explicit) return true

  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true

  return false
}

async function processSingle(baseUrl: string, workerId: string) {
  const job = await claimNextGenerationJob(workerId)
  if (!job) return { processed: false }

  try {
    const project = await getProjectForUser(job.owner_id, job.project_id)
    if (!project) {
      await failGenerationJob({
        jobId: job.id,
        ownerId: job.owner_id,
        projectId: job.project_id,
        attempts: job.attempts,
        maxAttempts: job.max_attempts,
        errorMessage: 'Project not found',
      })
      return { processed: true }
    }

    const mockupHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-owner-id': job.owner_id,
    }
    if (process.env.INTERNAL_QUEUE_SECRET) {
      mockupHeaders['x-internal-queue-secret'] = process.env.INTERNAL_QUEUE_SECRET
    }
    if (process.env.QUEUE_DISPATCH_SECRET) {
      mockupHeaders['x-queue-secret'] = process.env.QUEUE_DISPATCH_SECRET
    } else if (process.env.CRON_SECRET) {
      mockupHeaders.authorization = `Bearer ${process.env.CRON_SECRET}`
    }

    const res = await fetch(`${baseUrl}/api/mockups`, {
      method: 'POST',
      headers: mockupHeaders,
      body: JSON.stringify({
        imageUrl: project.originalImage,
        projectId: project.id,
        shotType: job.shot_type,
        preset: job.preset,
        generationIndex: job.generation_index,
        attempts: 2,
        variationSeed: job.variation_seed,
        editInstructions: job.edit_instructions ?? null,
        editedFromId: job.edited_from_id ?? null,
        editorBrandName: job.editor_brand_name ?? null,
        garmentType: project.generation?.garmentType,
        pipeline: project.generation?.pipeline ?? 'garment_photo',
      }),
    })

    const payload = (await res.json().catch(() => ({}))) as {
      generatedImage?: GeneratedImage
      error?: string
      modelCalls?: number
    }
    const modelCalls = Math.max(0, Math.trunc(Number(payload.modelCalls ?? 0)))
    if (modelCalls > 0) {
      await addGenerationJobModelCalls({ jobId: job.id, calls: modelCalls })
    }
    if (!res.ok || !payload.generatedImage) {
      throw new Error(payload.error || `Generator returned ${res.status}`)
    }

    const latest = await getProjectForUser(job.owner_id, job.project_id)
    if (!latest) {
      throw new Error('Project disappeared during generation')
    }

    await updateProjectForUser(job.owner_id, job.project_id, {
      generatedImages: [...latest.generatedImages, payload.generatedImage],
    })

    await completeGenerationJob({
      jobId: job.id,
      ownerId: job.owner_id,
      projectId: job.project_id,
    })

    return { processed: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown generation error'
    const isTerminalFailure = job.attempts >= job.max_attempts
    await failGenerationJob({
      jobId: job.id,
      ownerId: job.owner_id,
      projectId: job.project_id,
      attempts: job.attempts,
      maxAttempts: job.max_attempts,
      errorMessage: message,
    })
    if (isTerminalFailure) {
      await incrementCredits(job.owner_id, 1)
    }
    return { processed: true }
  }
}

export async function POST(req: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: 'Database is not configured (missing DATABASE_URL).' },
      { status: 503 }
    )
  }

  const session = await getServerSession(authOptions)
  const hasSecret = canRunWithSecret(req)
  if (!hasSecret && !session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const baseUrl = `${url.protocol}//${url.host}`
  const workerId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}`

  const maxJobs = 2
  let processed = 0
  for (let i = 0; i < maxJobs; i++) {
    const result = await processSingle(baseUrl, workerId)
    if (!result.processed) break
    processed += 1
  }

  return NextResponse.json({ ok: true, processed })
}

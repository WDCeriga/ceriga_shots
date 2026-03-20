import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { deleteProjectForUser, getProjectForUser, updateProjectForUser } from '@/lib/projects'
import type { Project } from '@/hooks/use-projects'
import { isDatabaseConfigured } from '@/lib/db'
import { z } from 'zod'
import { findUserById } from '@/lib/users'
import type { UserRole } from '@/lib/roles'
import { applyAssetRetentionToProject } from '@/lib/asset-retention'

const GeneratedImageSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum([
      'flat-lay',
      'product-shot',
      'lifestyle',
      'detail',
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
    ]),
    url: z.string(),
    timestamp: z.number(),
    prompt: z.string().optional(),
    editedFromId: z.string().optional(),
    editRequest: z.string().optional(),
    editedByUserId: z.string().optional(),
    editedByBrandName: z.string().nullable().optional(),
    editedAt: z.number().optional(),
  })
  .strict()

const GenerationStateSchema = z
  .object({
    status: z.enum(['idle', 'generating', 'complete', 'error']),
    total: z.number(),
    completed: z.number(),
    nextType: z
      .enum([
        'flat-lay',
        'product-shot',
        'lifestyle',
        'detail',
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
      .optional(),
    shotTypes: z
      .array(
        z.enum([
          'flat-lay',
          'product-shot',
          'lifestyle',
          'detail',
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
      )
      .optional(),
    preset: z.enum(['raw', 'editorial', 'luxury', 'natural', 'studio', 'surprise']).optional(),
    errorMessage: z.string().optional(),
  })
  .strict()

const ProjectPatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    generatedImages: z.array(GeneratedImageSchema).optional(),
    generation: GenerationStateSchema.optional(),
  })
  .strict()

function mergeGeneration(
  current: Project['generation'] | undefined,
  incoming: Project['generation'] | undefined
): Project['generation'] | undefined {
  if (!incoming) return current
  if (!current) return incoming

  // Never allow out-of-order updates to "downgrade" state/progress.
  const merged: NonNullable<Project['generation']> = {
    ...current,
    ...incoming,
    total: Math.max(current.total ?? 0, incoming.total ?? 0),
    completed: Math.max(current.completed ?? 0, incoming.completed ?? 0),
    shotTypes: incoming.shotTypes ?? current.shotTypes,
    preset: incoming.preset ?? current.preset,
  }

  const totalIncreased =
    typeof current.total === 'number' &&
    typeof incoming.total === 'number' &&
    incoming.total > current.total

  // If we've already completed and the client isn't asking for more, don't let late
  // "generating" patches restart it.
  if (current.status === 'complete' && incoming.status !== 'complete' && !totalIncreased) {
    merged.status = 'complete'
    merged.nextType = undefined
    merged.errorMessage = undefined
    merged.completed = Math.max(merged.completed, merged.total)
  }

  // If total is reached, force completion.
  if (merged.completed >= merged.total && merged.total > 0) {
    merged.status = 'complete'
    merged.completed = merged.total
    merged.nextType = undefined
    merged.errorMessage = undefined
  }

  // If transitioning to error, keep errorMessage but preserve progress/metadata.
  if (incoming.status === 'error') {
    merged.status = 'error'
    merged.errorMessage = incoming.errorMessage ?? current.errorMessage
  }

  return merged
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const url = new URL(_req.url)
  const id = url.pathname.split('/').pop() as string
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

  try {
    const project = await getProjectForUser(session.user.id, id)
    if (!project) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const user = await findUserById(session.user.id)
    const role = (user?.role ?? 'free') as UserRole
    const retained = applyAssetRetentionToProject(project, role)
    if (!retained.changed) {
      return NextResponse.json({ project })
    }
    const persisted = await updateProjectForUser(session.user.id, id, {
      generatedImages: retained.project.generatedImages,
    })
    return NextResponse.json({ project: persisted ?? retained.project })
  } catch (error) {
    console.error('GET /api/projects/[id] error', error)
    return NextResponse.json({ error: 'Failed to load project' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url)
  const id = url.pathname.split('/').pop() as string
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

  const parsed = ProjectPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const updates: Partial<Project> = parsed.data

  try {
    const existing = await getProjectForUser(session.user.id, id)
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const safeUpdates: Partial<Project> = {
      ...updates,
      generation: mergeGeneration(existing.generation, updates.generation),
    }

    const project = await updateProjectForUser(session.user.id, id, safeUpdates)
    if (!project) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ project })
  } catch (error) {
    console.error('PATCH /api/projects/[id] error', error)
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest): Promise<NextResponse> {
  const url = new URL(_req.url)
  const id = url.pathname.split('/').pop() as string
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

  try {
    await deleteProjectForUser(session.user.id, id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/projects/[id] error', error)
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}


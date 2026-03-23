import { db, ensureSchema } from '@/lib/db'
import type { Project } from '@/types/projects'
import { getProjectForUser, updateProjectForUser } from '@/lib/projects'

export type ShotType = NonNullable<NonNullable<Project['generation']>['nextType']>
export type Preset = NonNullable<NonNullable<Project['generation']>['preset']>

export type GenerationJob = {
  id: string
  owner_id: string
  project_id: string
  shot_type: ShotType
  preset: Preset
  generation_index: number
  variation_seed: number
  edit_instructions?: string | null
  edited_from_id?: string | null
  editor_brand_name?: string | null
  status: 'queued' | 'processing' | 'done' | 'failed'
  attempts: number
  model_calls: number
  max_attempts: number
  run_after: string
}

type QueueProjectRow = {
  generated_images: unknown
}

function asShotType(input: string): ShotType {
  return input as ShotType
}

function asPreset(input: string): Preset {
  return input as Preset
}

function toInt32Seed(n: number): number {
  const min = 1
  const max = 2_147_483_647
  if (!Number.isFinite(n)) return min
  const value = Math.trunc(Math.abs(n))
  if (value < min) return min
  if (value > max) {
    // Wrap into signed 32-bit positive range accepted by Postgres INTEGER.
    return (value % max) + 1
  }
  return value
}

type GenerationJobRow = {
  id: string
  owner_id: string
  project_id: string
  shot_type: string
  preset: string
  generation_index: number
  variation_seed: number
  edit_instructions?: string | null
  edited_from_id?: string | null
  editor_brand_name?: string | null
  status: string
  attempts: number
  model_calls: number
  max_attempts: number
  run_after: string
}

function toJobs(rows: GenerationJobRow[]): GenerationJob[] {
  return rows.map((row) => ({
    id: String(row.id),
    owner_id: String(row.owner_id),
    project_id: String(row.project_id),
    shot_type: asShotType(String(row.shot_type)),
    preset: asPreset(String(row.preset)),
    generation_index: Number(row.generation_index),
    variation_seed: Number(row.variation_seed),
    edit_instructions: row.edit_instructions ?? null,
    edited_from_id: row.edited_from_id ?? null,
    editor_brand_name: row.editor_brand_name ?? null,
    status: row.status as GenerationJob['status'],
    attempts: Number(row.attempts),
    model_calls: Number(row.model_calls ?? 0),
    max_attempts: Number(row.max_attempts),
    run_after: String(row.run_after),
  }))
}

const STALE_PROCESSING_MINUTES = 5

async function requeueStaleProcessingJobs() {
  await db`
    update generation_jobs
    set
      status = 'queued',
      locked_at = null,
      locked_by = null,
      run_after = now(),
      updated_at = now(),
      error_message = coalesce(error_message, 'Recovered stale processing job')
    where
      status = 'processing'
      and locked_at is not null
      and locked_at < now() - make_interval(mins => ${STALE_PROCESSING_MINUTES})
  `
}

export async function enqueueGenerationJobs(args: {
  ownerId: string
  projectId: string
  shotTypes: ShotType[]
  preset: Preset
  garmentType?: string
  editInstructions?: string
  editedFromId?: string
  editorBrandName?: string | null
}) {
  if (!args.shotTypes.length) return
  await ensureSchema()

  const existingRows = (await db`
    select generated_images
    from projects
    where owner_id = ${args.ownerId} and id = ${args.projectId}
    limit 1
  `) as QueueProjectRow[]
  const existing = existingRows[0]
  if (!existing) {
    throw new Error('Project not found while enqueueing generation jobs')
  }

  const generatedImages = (existing.generated_images as Array<{ type?: string }>) ?? []
  const countByType = new Map<string, number>()
  for (const img of generatedImages) {
    const type = typeof img?.type === 'string' ? img.type : ''
    if (!type) continue
    countByType.set(type, (countByType.get(type) ?? 0) + 1)
  }

  const pendingRows = (await db`
    select shot_type, count(*)::int as count
    from generation_jobs
    where owner_id = ${args.ownerId}
      and project_id = ${args.projectId}
      and status in ('queued', 'processing')
    group by shot_type
  `) as Array<{ shot_type: string; count: number }>

  for (const row of pendingRows) {
    countByType.set(row.shot_type, (countByType.get(row.shot_type) ?? 0) + Number(row.count))
  }

  for (let i = 0; i < args.shotTypes.length; i++) {
    const shotType = args.shotTypes[i]!
    const indexForType = (countByType.get(shotType) ?? 0) + 1
    countByType.set(shotType, indexForType)
    const rawSeed = Date.now() + i * 9973 + Math.floor(Math.random() * 1000)
    const variationSeed = toInt32Seed(rawSeed)

    await db`
      insert into generation_jobs (
        owner_id,
        project_id,
        shot_type,
        preset,
        generation_index,
        variation_seed,
        edit_instructions,
        edited_from_id,
        editor_brand_name,
        status,
        attempts,
        max_attempts
      )
      values (
        ${args.ownerId},
        ${args.projectId}::uuid,
        ${shotType},
        ${args.preset},
        ${indexForType},
        ${variationSeed},
        ${args.editInstructions ?? null},
        ${args.editedFromId ?? null},
        ${args.editorBrandName ?? null},
        'queued',
        0,
        3
      )
    `
  }

  const pendingAfterRows = (await db`
    select count(*)::int as count
    from generation_jobs
    where owner_id = ${args.ownerId}
      and project_id = ${args.projectId}
      and status in ('queued', 'processing')
  `) as Array<{ count: number }>
  const pendingAfter = Number(pendingAfterRows[0]?.count ?? 0)

  const project = await getProjectForUser(args.ownerId, args.projectId)
  if (!project) return
  const completed = project.generatedImages.length
  const total = completed + pendingAfter

  await updateProjectForUser(args.ownerId, args.projectId, {
    generation: {
      status: 'generating',
      total,
      completed,
      preset: args.preset,
      nextType: args.shotTypes[0],
      errorMessage: undefined,
      shotTypes: undefined,
      // Preserve the pipeline selected when the user enqueued the generation.
      // Otherwise downstream workers fall back to `garment_photo`.
      pipeline: project.generation?.pipeline,
      garmentType: args.garmentType,
    },
  })
}

export async function claimNextGenerationJob(workerId: string): Promise<GenerationJob | null> {
  await ensureSchema()
  await requeueStaleProcessingJobs()
  const rows = (await db`
    with next_job as (
      select id
      from generation_jobs
      where status = 'queued' and run_after <= now()
      order by created_at asc
      limit 1
      for update skip locked
    )
    update generation_jobs as j
    set
      status = 'processing',
      attempts = j.attempts + 1,
      locked_at = now(),
      locked_by = ${workerId},
      updated_at = now()
    from next_job
    where j.id = next_job.id
    returning j.*
  `) as GenerationJobRow[]
  const jobs = toJobs(rows)
  return jobs[0] ?? null
}

export async function completeGenerationJob(args: {
  jobId: string
  ownerId: string
  projectId: string
}) {
  await ensureSchema()
  await db`
    update generation_jobs
    set status = 'done', locked_at = null, locked_by = null, updated_at = now(), error_message = null
    where id = ${args.jobId}::uuid
  `

  const pendingRows = (await db`
    select count(*)::int as count
    from generation_jobs
    where owner_id = ${args.ownerId}
      and project_id = ${args.projectId}
      and status in ('queued', 'processing')
  `) as Array<{ count: number }>
  const pending = Number(pendingRows[0]?.count ?? 0)

  const nextRows = (await db`
    select shot_type
    from generation_jobs
    where owner_id = ${args.ownerId}
      and project_id = ${args.projectId}
      and status = 'queued'
    order by created_at asc
    limit 1
  `) as Array<{ shot_type: string }>

  const project = await getProjectForUser(args.ownerId, args.projectId)
  if (!project) return

  const completed = project.generatedImages.length
  const total = completed + pending
  const isDone = pending === 0

  await updateProjectForUser(args.ownerId, args.projectId, {
    generation: {
      status: isDone ? 'complete' : 'generating',
      total,
      completed,
      preset: project.generation?.preset ?? 'raw',
      nextType: (nextRows[0]?.shot_type as ShotType | undefined) ?? undefined,
      errorMessage: undefined,
      garmentType: project.generation?.garmentType,
    },
  })
}

export async function addGenerationJobModelCalls(args: {
  jobId: string
  calls: number
}) {
  await ensureSchema()
  const calls = Math.max(0, Math.trunc(args.calls))
  if (calls <= 0) return
  await db`
    update generation_jobs
    set model_calls = model_calls + ${calls}, updated_at = now()
    where id = ${args.jobId}::uuid
  `
}

export async function failGenerationJob(args: {
  jobId: string
  ownerId: string
  projectId: string
  attempts: number
  maxAttempts: number
  errorMessage: string
}) {
  await ensureSchema()
  const shouldRetry = args.attempts < args.maxAttempts
  const delaySeconds = shouldRetry ? Math.min(60, 5 * args.attempts) : 0

  if (shouldRetry) {
    await db`
      update generation_jobs
      set
        status = 'queued',
        run_after = now() + make_interval(secs => ${delaySeconds}),
        locked_at = null,
        locked_by = null,
        error_message = ${args.errorMessage},
        updated_at = now()
      where id = ${args.jobId}::uuid
    `
  } else {
    await db`
      update generation_jobs
      set
        status = 'failed',
        locked_at = null,
        locked_by = null,
        error_message = ${args.errorMessage},
        updated_at = now()
      where id = ${args.jobId}::uuid
    `
  }

  const project = await getProjectForUser(args.ownerId, args.projectId)
  if (!project) return

  const pendingRows = (await db`
    select count(*)::int as count
    from generation_jobs
    where owner_id = ${args.ownerId}
      and project_id = ${args.projectId}
      and status in ('queued', 'processing')
  `) as Array<{ count: number }>
  const pending = Number(pendingRows[0]?.count ?? 0)

  const total = project.generatedImages.length + pending
  await updateProjectForUser(args.ownerId, args.projectId, {
    generation: {
      status: shouldRetry ? 'generating' : 'error',
      total,
      completed: project.generatedImages.length,
      preset: project.generation?.preset,
      nextType: project.generation?.nextType,
      errorMessage: shouldRetry ? undefined : args.errorMessage,
      garmentType: project.generation?.garmentType,
    },
  })
}

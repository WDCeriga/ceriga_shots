import { db, ensureSchema } from '@/lib/db'
import type { GeneratedImage, GenerationState, Project } from '@/hooks/use-projects'

type DbProjectRow = {
  id: string
  owner_id: string
  name: string
  original_image: string
  original_image_name: string
  generated_images: unknown
  generated_count?: number
  generation: unknown | null
  created_at: string
  updated_at: string
}

function mapRow(row: DbProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    originalImage: row.original_image,
    originalImageName: row.original_image_name,
    generatedImages: (row.generated_images as GeneratedImage[]) ?? [],
    generatedCount:
      row.generated_count != null
        ? Number(row.generated_count)
        : ((row.generated_images as GeneratedImage[]) ?? []).length,
    generation: (row.generation as GenerationState | null) ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

type DbProjectStatusRow = {
  generation: unknown | null
  generated_count: number
}

type DbProjectGenerationContextRow = {
  id: string
  generation: unknown | null
  generated_count: number
}

type DbProjectAssetTypeRow = {
  type: string | null
}

export type ProjectGenerationStatus = {
  status: NonNullable<GenerationState['status']>
  total: number
  completed: number
  nextType?: GenerationState['nextType']
  errorMessage?: string
}

export async function getProjectsForUser(ownerId: string): Promise<Project[]> {
  await ensureSchema()
  const rows = (await db`
    select
      id,
      owner_id,
      name,
      original_image,
      original_image_name,
      '[]'::jsonb as generated_images,
      jsonb_array_length(generated_images)::int as generated_count,
      generation,
      created_at,
      updated_at
    from projects
    where owner_id = ${ownerId}
    order by created_at desc
  `) as DbProjectRow[]
  return rows.map(mapRow)
}

export async function getProjectForUser(ownerId: string, id: string): Promise<Project | null> {
  await ensureSchema()
  const rows = (await db`
    select *
    from projects
    where owner_id = ${ownerId} and id = ${id}
    limit 1
  `) as DbProjectRow[]
  return rows[0] ? mapRow(rows[0]) : null
}

export async function getProjectGenerationStatusForUser(
  ownerId: string,
  id: string
): Promise<ProjectGenerationStatus | null> {
  await ensureSchema()
  const rows = (await db`
    select generation, jsonb_array_length(generated_images)::int as generated_count
    from projects
    where owner_id = ${ownerId} and id = ${id}
    limit 1
  `) as DbProjectStatusRow[]
  const row = rows[0]
  if (!row) return null

  const generation = (row.generation as GenerationState | null) ?? null
  const completed = Number(row.generated_count ?? 0)
  const total = Math.max(completed, Number(generation?.total ?? completed))

  return {
    status: generation?.status ?? 'idle',
    total,
    completed,
    nextType: generation?.nextType,
    errorMessage: generation?.errorMessage,
  }
}

export type ProjectGenerationContext = {
  id: string
  generation?: GenerationState
  generatedCount: number
}

export async function getProjectGenerationContextForUser(
  ownerId: string,
  id: string
): Promise<ProjectGenerationContext | null> {
  await ensureSchema()
  const rows = (await db`
    select id, generation, jsonb_array_length(generated_images)::int as generated_count
    from projects
    where owner_id = ${ownerId} and id = ${id}
    limit 1
  `) as DbProjectGenerationContextRow[]
  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    generation: (row.generation as GenerationState | null) ?? undefined,
    generatedCount: Number(row.generated_count ?? 0),
  }
}

export async function getProjectAssetTypeForUser(
  ownerId: string,
  projectId: string,
  assetId: string
): Promise<string | null> {
  await ensureSchema()
  const rows = (await db`
    select img->>'type' as type
    from projects p
    cross join lateral jsonb_array_elements(p.generated_images) as img
    where p.owner_id = ${ownerId}
      and p.id = ${projectId}
      and img->>'id' = ${assetId}
    limit 1
  `) as DbProjectAssetTypeRow[]
  return rows[0]?.type ?? null
}

export async function getProjectsCountForUser(ownerId: string): Promise<number> {
  await ensureSchema()
  const rows = (await db`
    select count(*)::int as count
    from projects
    where owner_id = ${ownerId}
  `) as Array<{ count: number }>
  return Number(rows[0]?.count ?? 0)
}

export async function createProjectForUser(
  ownerId: string,
  input: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Project> {
  await ensureSchema()
  const now = new Date()
  const rows = (await db`
    insert into projects (
      owner_id,
      name,
      original_image,
      original_image_name,
      generated_images,
      generation,
      created_at,
      updated_at
    )
    values (
      ${ownerId},
      ${input.name},
      ${input.originalImage},
      ${input.originalImageName},
      ${JSON.stringify(input.generatedImages ?? [])}::jsonb,
      ${input.generation ? JSON.stringify(input.generation) : null}::jsonb,
      ${now.toISOString()},
      ${now.toISOString()}
    )
    returning *
  `) as DbProjectRow[]
  return mapRow(rows[0])
}

export async function updateProjectForUser(
  ownerId: string,
  id: string,
  updates: Partial<Project>
): Promise<Project | null> {
  await ensureSchema()

  const setClauses: string[] = []
  const params: any[] = []

  if (updates.name !== undefined) {
    params.push(updates.name)
    setClauses.push(`name = $${params.length}`)
  }
  if (updates.originalImage !== undefined) {
    params.push(updates.originalImage)
    setClauses.push(`original_image = $${params.length}`)
  }
  if (updates.originalImageName !== undefined) {
    params.push(updates.originalImageName)
    setClauses.push(`original_image_name = $${params.length}`)
  }
  if (updates.generatedImages !== undefined) {
    params.push(JSON.stringify(updates.generatedImages))
    setClauses.push(`generated_images = $${params.length}::jsonb`)
  }
  if (updates.generation !== undefined) {
    params.push(updates.generation ? JSON.stringify(updates.generation) : null)
    setClauses.push(`generation = $${params.length}::jsonb`)
  }

  if (!setClauses.length) {
    return getProjectForUser(ownerId, id)
  }

  const nowIso = new Date().toISOString()
  params.push(nowIso, ownerId, id)
  const updatedAtParam = `$${params.length - 2}`
  const ownerParam = `$${params.length - 1}`
  const idParam = `$${params.length}`

  const sql = `
    update projects
    set ${setClauses.join(', ')},
        updated_at = ${updatedAtParam}
    where owner_id = ${ownerParam} and id = ${idParam}
    returning *
  `

  const rows = (await (db as any).query(sql, params)) as DbProjectRow[]
  return rows[0] ? mapRow(rows[0]) : null
}

export async function deleteProjectForUser(ownerId: string, id: string): Promise<void> {
  await ensureSchema()
  await db`
    delete from projects
    where owner_id = ${ownerId} and id = ${id}
  `
}


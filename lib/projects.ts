import { db, ensureSchema } from '@/lib/db'
import type { GeneratedImage, GenerationState, Project } from '@/hooks/use-projects'

type DbProjectRow = {
  id: string
  owner_id: string
  name: string
  original_image: string
  original_image_name: string
  generated_images: unknown
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
    generation: (row.generation as GenerationState | null) ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

export async function getProjectsForUser(ownerId: string): Promise<Project[]> {
  await ensureSchema()
  const rows = (await db`
    select *
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


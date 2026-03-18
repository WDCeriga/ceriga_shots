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

  const fields: string[] = []
  const values: any[] = []

  if (updates.name !== undefined) {
    fields.push('name')
    values.push(updates.name)
  }
  if (updates.originalImage !== undefined) {
    fields.push('original_image')
    values.push(updates.originalImage)
  }
  if (updates.originalImageName !== undefined) {
    fields.push('original_image_name')
    values.push(updates.originalImageName)
  }
  if (updates.generatedImages !== undefined) {
    fields.push('generated_images')
    values.push(JSON.stringify(updates.generatedImages))
  }
  if (updates.generation !== undefined) {
    fields.push('generation')
    values.push(updates.generation ? JSON.stringify(updates.generation) : null)
  }

  if (!fields.length) {
    return getProjectForUser(ownerId, id)
  }

  const nowIso = new Date().toISOString()
  const rows = (await db`
    update projects
    set
      ${db(fields.reduce((acc, field, index) => ({ ...acc, [field]: values[index] }), {} as any))},
      updated_at = ${nowIso}
    where owner_id = ${ownerId} and id = ${id}
    returning *
  `) as DbProjectRow[]
  return rows[0] ? mapRow(rows[0]) : null
}

export async function deleteProjectForUser(ownerId: string, id: string): Promise<void> {
  await ensureSchema()
  await db`
    delete from projects
    where owner_id = ${ownerId} and id = ${id}
  `
}


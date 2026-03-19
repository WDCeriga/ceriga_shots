import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured, db, ensureSchema } from '@/lib/db'
import { findUserById } from '@/lib/users'
import type { Project } from '@/types/projects'

export const runtime = 'nodejs'

type Row = {
  id: string
  owner_id: string
  owner_email: string | null
  name: string
  original_image: string
  original_image_name: string
  generated_images: unknown
  generation: unknown
  created_at: string
  updated_at: string
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await findUserById(userId)
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Database is not configured (missing DATABASE_URL).' }, { status: 503 })
  }
  await ensureSchema()

  const id = new URL(req.url).pathname.split('/').pop() as string
  const rows = (await db`
    select
      p.id,
      p.owner_id,
      u.email as owner_email,
      p.name,
      p.original_image,
      p.original_image_name,
      p.generated_images,
      p.generation,
      p.created_at,
      p.updated_at
    from projects p
    left join users u on u.id::text = p.owner_id
    where p.id = ${id}::uuid
    limit 1
  `) as Row[]

  const row = rows[0]
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const project: Project = {
    id: row.id,
    name: row.name,
    originalImage: row.original_image,
    originalImageName: row.original_image_name,
    generatedImages: (row.generated_images as Project['generatedImages']) ?? [],
    generation: (row.generation as Project['generation']) ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }

  return NextResponse.json({
    project,
    owner: {
      id: row.owner_id,
      email: row.owner_email ?? 'Unknown',
    },
  })
}

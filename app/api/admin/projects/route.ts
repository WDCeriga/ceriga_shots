import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured, db, ensureSchema } from '@/lib/db'
import { findUserById } from '@/lib/users'

export const runtime = 'nodejs'

type Row = {
  id: string
  owner_email: string | null
  name: string
  generated_count: number
  has_localhost_generations: boolean
  generation: unknown
  created_at: string
  updated_at: string
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await findUserById(userId)
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Database is not configured (missing DATABASE_URL).' }, { status: 503 })
  }
  await ensureSchema()

  const rows = (await db`
    select
      p.id,
      u.email as owner_email,
      p.name,
      jsonb_array_length(p.generated_images)::int as generated_count,
      exists (
        select 1
        from jsonb_array_elements(p.generated_images) as gi
        where lower(coalesce(gi->>'url', '')) like 'http://localhost%'
           or lower(coalesce(gi->>'url', '')) like 'https://localhost%'
      ) as has_localhost_generations,
      p.generation,
      p.created_at,
      p.updated_at
    from projects p
    left join users u on u.id::text = p.owner_id
    order by created_at desc
    limit 300
  `) as Row[]

  return NextResponse.json(
    {
      projects: rows.map((r) => {
      const generation = (r.generation ?? null) as { preset?: string; pipeline?: string; renderStyleLevel?: string } | null
      const inferredPipeline =
        generation?.pipeline ??
        (generation?.renderStyleLevel ? 'design_realize' : 'garment_photo')
      return {
        id: r.id,
        ownerEmail: r.owner_email ?? 'Unknown',
        name: r.name,
        generatedCount: Number(r.generated_count ?? 0),
        hasLocalhostGenerations: Boolean(r.has_localhost_generations),
        visualDirection: generation?.preset ?? '—',
        pipeline: inferredPipeline,
        renderStyleLevel: generation?.renderStyleLevel ?? undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }
      }),
    },
    { headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=30' } }
  )
}

import { NextResponse } from 'next/server'
import { db, ensureSchema, isDatabaseConfigured } from '@/lib/db'

export const runtime = 'nodejs'

type WeeklyCountRow = {
  count: number
}

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ count: 0 })
  }

  await ensureSchema()

  const rows = (await db`
    select coalesce(sum(project_count), 0)::int as count
    from (
      select count(*)::int as project_count
      from projects p
      cross join lateral jsonb_array_elements(p.generated_images) as img
      where (img->>'timestamp') ~ '^[0-9]+$'
        and to_timestamp(((img->>'timestamp')::bigint / 1000.0)) >= date_trunc('week', now())
    ) weekly
  `) as WeeklyCountRow[]

  return NextResponse.json({ count: Number(rows[0]?.count ?? 0) })
}

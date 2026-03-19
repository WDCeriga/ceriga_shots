import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured } from '@/lib/db'
import { getShareAuditLog } from '@/lib/shares'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.pathname.split('/').slice(-2)[0] as string
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

  const audit = await getShareAuditLog(token, session.user.id)
  return NextResponse.json({ audit })
}

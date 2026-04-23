import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db, ensureSchema, isDatabaseConfigured } from '@/lib/db'

export const runtime = 'nodejs'

const MESSAGE_MIN = 3
const MESSAGE_MAX = 5000

function isLooseEmail(value: string): boolean {
  if (value.length > 320) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export async function POST(req: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Feedback is not available (database not configured).' }, { status: 503 })
  }

  let body: { message?: unknown; pagePath?: unknown; contactEmail?: unknown }
  try {
    body = (await req.json()) as { message?: unknown; pagePath?: unknown; contactEmail?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) {
    return NextResponse.json(
      { error: `Message must be between ${MESSAGE_MIN} and ${MESSAGE_MAX} characters.` },
      { status: 400 }
    )
  }

  const pagePathRaw = typeof body.pagePath === 'string' ? body.pagePath.trim() : ''
  const pagePath = pagePathRaw.length > 0 ? pagePathRaw.slice(0, 2048) : null

  const session = await getServerSession(authOptions)
  const userId = session?.user?.id ?? null
  const sessionEmail = session?.user?.email?.trim() ?? null

  let userEmail: string | null = sessionEmail
  if (!sessionEmail) {
    const contactRaw = typeof body.contactEmail === 'string' ? body.contactEmail.trim() : ''
    if (contactRaw) {
      if (!isLooseEmail(contactRaw)) {
        return NextResponse.json({ error: 'Please enter a valid email, or leave it blank.' }, { status: 400 })
      }
      userEmail = contactRaw
    }
  }

  await ensureSchema()
  await db`
    insert into user_feedback (user_id, user_email, page_path, message)
    values (${userId}, ${userEmail}, ${pagePath}, ${message})
  `

  return NextResponse.json({ ok: true })
}

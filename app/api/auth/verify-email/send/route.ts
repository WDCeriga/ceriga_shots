import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { findUserById, setEmailVerificationToken } from '@/lib/users'
import { sendVerificationEmail } from '@/lib/email'
import { applyRateLimit } from '@/lib/rate-limit'
import crypto from 'crypto'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  const rl = await applyRateLimit({
    key: `rl:verify-email:${userId}`,
    limit: 3,
    windowSeconds: 600,
  })
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${rl.retryAfterSeconds}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    )
  }

  const user = await findUserById(userId)
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (user.email_verified) {
    return NextResponse.json({ error: 'Email already verified' }, { status: 400 })
  }

  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await setEmailVerificationToken(userId, token, expiresAt)
  const result = await sendVerificationEmail(user.email, token)

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || 'Failed to send verification email' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}

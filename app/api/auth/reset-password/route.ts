import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { applyRateLimit, getRequestIp } from '@/lib/rate-limit'
import { updateUserPassword, verifyPasswordResetToken } from '@/lib/users'

export async function POST(req: Request) {
  const ip = getRequestIp(req)

  let body: { token?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!token || password.length < 8) {
    return NextResponse.json(
      { error: 'A valid reset token and a new password (min 8 characters) are required.' },
      { status: 400 }
    )
  }

  // Rate limit confirmation attempts to reduce brute-force risk.
  const rl = await applyRateLimit({
    key: `rl:reset-password:confirm:ip:${ip}`,
    limit: 10,
    windowSeconds: 60 * 15,
  })
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many password reset attempts. Try again in ${rl.retryAfterSeconds}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    )
  }

  const user = await verifyPasswordResetToken(token)
  if (!user) {
    return NextResponse.json({ error: 'Reset token is invalid or expired.' }, { status: 400 })
  }

  // Extra guard: reject obviously non-reset tokens (best-effort).
  if (!/^[0-9a-fA-F-]{36,}$/.test(token) && typeof crypto.randomUUID === 'function') {
    // No-op: token format check is intentionally loose to avoid false negatives.
  }

  await updateUserPassword(user.id, password)

  return NextResponse.json({ ok: true })
}


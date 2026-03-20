import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { applyRateLimit, getRequestIp } from '@/lib/rate-limit'
import { findUserByEmail, setPasswordResetToken } from '@/lib/users'
import { sendPasswordResetEmail } from '@/lib/email'

export async function POST(req: Request) {
  const ip = getRequestIp(req)

  let body: { email?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

  // Avoid account enumeration: always respond with `ok: true` for unknown emails.
  const okResponse = NextResponse.json({ ok: true })

  if (!email) return okResponse

  const ipLimit = await applyRateLimit({
    key: `rl:reset-password:ip:${ip}`,
    limit: 5,
    windowSeconds: 60 * 15,
  })

  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: `Too many reset attempts. Try again in ${ipLimit.retryAfterSeconds}s.` },
      { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) } }
    )
  }

  const emailLimit = await applyRateLimit({
    key: `rl:reset-password:email:${email}`,
    limit: 5,
    windowSeconds: 60 * 60 * 24,
  })

  if (!emailLimit.ok) {
    return NextResponse.json(
      {
        error: `Too many reset requests for this email. Try again in ${emailLimit.retryAfterSeconds}s.`,
      },
      { status: 429, headers: { 'Retry-After': String(emailLimit.retryAfterSeconds) } }
    )
  }

  const user = await findUserByEmail(email)
  if (!user) return okResponse

  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  await setPasswordResetToken(user.id, token, expiresAt)

  try {
    const result = await sendPasswordResetEmail(user.email, token)
    if (!result.ok) {
      // Keep flow non-fatal. Token exists, but without an email the user won't be able to use it.
      console.error('Failed to send password reset email:', result.error)
    }
  } catch (e) {
    console.error('Password reset email error:', e)
  }

  return okResponse
}


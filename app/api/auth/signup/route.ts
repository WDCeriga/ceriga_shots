import { NextResponse } from 'next/server'
import { createUser, setEmailVerificationToken } from '@/lib/users'
import { applyRateLimit, getRequestIp } from '@/lib/rate-limit'
import { sendVerificationEmail } from '@/lib/email'
import crypto from 'crypto'

export async function POST(req: Request) {
  const ip = getRequestIp(req)
  const ipLimit = await applyRateLimit({
    key: `rl:signup:ip:${ip}`,
    limit: 5,
    windowSeconds: 60,
  })
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: `Too many signup attempts. Try again in ${ipLimit.retryAfterSeconds}s.` },
      {
        status: 429,
        headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
      }
    )
  }

  let body: { email?: string; password?: string; brandName?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  const password = body.password ?? ''
  const brandName = typeof body.brandName === 'string' ? body.brandName : undefined

  if (email) {
    const emailLimit = await applyRateLimit({
      key: `rl:signup:email:${email}`,
      limit: 5,
      windowSeconds: 24 * 60 * 60,
    })
    if (!emailLimit.ok) {
      return NextResponse.json(
        { error: `Too many signup attempts for this email. Try again in ${emailLimit.retryAfterSeconds}s.` },
        {
          status: 429,
          headers: { 'Retry-After': String(emailLimit.retryAfterSeconds) },
        }
      )
    }
  }

  if (!email || !password || password.length < 8) {
    return NextResponse.json(
      { error: 'Email and password (min 8 chars) are required.' },
      { status: 400 }
    )
  }

  if (brandName && brandName.trim().length > 80) {
    return NextResponse.json(
      { error: 'Brand name must be 80 characters or less.' },
      { status: 400 }
    )
  }

  try {
    const user = await createUser(email, password, brandName)

    try {
      const token = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      await setEmailVerificationToken(user.id, token, expiresAt)
      await sendVerificationEmail(email, token)
    } catch (emailErr) {
      console.error('Failed to send verification email on signup:', emailErr)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && /exists/i.test(error.message)) {
      return NextResponse.json({ error: 'User already exists.' }, { status: 409 })
    }
    console.error('Signup error', error)
    return NextResponse.json({ error: 'Failed to sign up.' }, { status: 500 })
  }
}


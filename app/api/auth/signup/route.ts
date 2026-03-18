import { NextResponse } from 'next/server'
import { createUser } from '@/lib/users'

export async function POST(req: Request) {
  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  const password = body.password ?? ''

  if (!email || !password || password.length < 8) {
    return NextResponse.json(
      { error: 'Email and password (min 8 chars) are required.' },
      { status: 400 }
    )
  }

  try {
    await createUser(email, password)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && /exists/i.test(error.message)) {
      return NextResponse.json({ error: 'User already exists.' }, { status: 409 })
    }
    console.error('Signup error', error)
    return NextResponse.json({ error: 'Failed to sign up.' }, { status: 500 })
  }
}


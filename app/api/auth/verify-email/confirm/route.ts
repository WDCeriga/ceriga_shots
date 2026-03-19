import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyEmailByToken } from '@/lib/users'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(new URL('/dashboard?verified=invalid', req.url))
  }

  const user = await verifyEmailByToken(token)

  if (!user) {
    return NextResponse.redirect(new URL('/dashboard?verified=expired', req.url))
  }

  return NextResponse.redirect(new URL('/dashboard?verified=true', req.url))
}

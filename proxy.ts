import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function proxy(req: NextRequest) {
  // Lock down high-cost endpoints that should never be public.
  if (req.nextUrl.pathname.startsWith('/api/mockups')) {
    const token = await getToken({
      req,
      secret: process.env.AUTH_SECRET ?? 'development-secret',
    })

    const userId = (token as any)?.id ?? token?.sub
    if (!userId) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: {
          'content-type': 'application/json',
        },
      })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/mockups'],
}

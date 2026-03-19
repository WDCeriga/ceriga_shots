import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function proxy(req: NextRequest) {
  // Lock down high-cost endpoints that should never be public.
  if (req.nextUrl.pathname.startsWith('/api/mockups')) {
    const internalSecret = process.env.INTERNAL_QUEUE_SECRET
    const queueSecret = process.env.QUEUE_DISPATCH_SECRET
    const cronSecret = process.env.CRON_SECRET
    const internalToken = req.headers.get('x-internal-queue-secret')
    const queueToken = req.headers.get('x-queue-secret')
    const authHeader = req.headers.get('authorization')
    const ownerId = req.headers.get('x-owner-id')
    const hasOwner = typeof ownerId === 'string' && ownerId.trim().length > 0
    const trustedInternalCall =
      hasOwner &&
      ((Boolean(internalSecret) && internalToken === internalSecret) ||
        (Boolean(queueSecret) && queueToken === queueSecret) ||
        (Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`))

    if (trustedInternalCall) {
      return NextResponse.next()
    }

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

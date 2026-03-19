import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { findUserById } from '@/lib/users'
import { getStripe, isStripeConfigured } from '@/lib/stripe'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 })
  }

  const user = await findUserById(userId)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!user.stripe_customer_id) {
    return NextResponse.json({ error: 'No Stripe customer found for this account.' }, { status: 400 })
  }

  const stripe = getStripe()
  const origin = new URL(req.url).origin
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${origin}/dashboard/settings`,
  })

  return NextResponse.json({ url: portalSession.url })
}

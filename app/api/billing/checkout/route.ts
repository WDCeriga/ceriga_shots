import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Stripe from 'stripe'
import { authOptions } from '@/lib/auth'
import { findUserById, setUserStripeCustomerId } from '@/lib/users'
import { BillingCycle, BillingPlanRole, getCheckoutUnitAmountCents } from '@/lib/billing'
import { getStripe, isStripeConfigured } from '@/lib/stripe'

export const runtime = 'nodejs'

type CheckoutBody = {
  plan?: string
  billingCycle?: BillingCycle
}

function asBillingRole(value: string): BillingPlanRole | null {
  if (value === 'starter' || value === 'studio' || value === 'label') return value
  return null
}

async function findOrCreatePriceId(stripe: Stripe, role: BillingPlanRole, cycle: BillingCycle): Promise<string> {
  const amountCents = getCheckoutUnitAmountCents(role, cycle)
  if (amountCents == null) throw new Error(`Missing plan amount for ${role}.`)

  const interval: Stripe.PriceCreateParams.Recurring.Interval = cycle === 'yearly' ? 'year' : 'month'
  const productName = `Ceriga Shots ${role[0].toUpperCase()}${role.slice(1)}`

  const products = await stripe.products.list({ active: true, limit: 100 })
  let product = products.data.find(
    (entry) => entry.metadata?.app === 'ceriga-shots' && entry.metadata?.role === role
  )
  if (!product) {
    product = await stripe.products.create({
      name: productName,
      metadata: { app: 'ceriga-shots', role },
    })
  }

  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    type: 'recurring',
    limit: 100,
  })
  const existing = prices.data.find(
    (price) =>
      price.currency === 'eur' &&
      price.unit_amount === amountCents &&
      price.recurring?.interval === interval &&
      price.metadata?.role === role &&
      price.metadata?.cycle === cycle
  )
  if (existing) return existing.id

  const created = await stripe.prices.create({
    product: product.id,
    currency: 'eur',
    unit_amount: amountCents,
    recurring: { interval },
    metadata: { app: 'ceriga-shots', role, cycle },
  })
  return created.id
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 })
  }

  let body: CheckoutBody
  try {
    body = (await req.json()) as CheckoutBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const plan = asBillingRole(String(body.plan ?? ''))
  if (!plan) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

  const cycle: BillingCycle = body.billingCycle === 'yearly' ? 'yearly' : 'monthly'

  const user = await findUserById(userId)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const stripe = getStripe()
  if (
    user.stripe_customer_id &&
    user.stripe_subscription_id &&
    user.stripe_subscription_status &&
    ['active', 'trialing', 'past_due'].includes(user.stripe_subscription_status)
  ) {
    const origin = new URL(req.url).origin
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${origin}/pricing`,
    })
    return NextResponse.json({ url: portalSession.url, mode: 'portal' })
  }

  let customerId = user.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    })
    customerId = customer.id
    await setUserStripeCustomerId(user.id, customerId)
  }

  const priceId = await findOrCreatePriceId(stripe, plan, cycle)
  const origin = new URL(req.url).origin
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    locale: 'auto',
    custom_text: {
      submit: {
        message: 'Cancel anytime from Settings > Manage billing.',
      },
    },
    success_url: `${origin}/pricing?checkout=success`,
    cancel_url: `${origin}/pricing?checkout=cancelled`,
    metadata: {
      userId: user.id,
      targetRole: plan,
      billingCycle: cycle,
    },
    subscription_data: {
      metadata: {
        userId: user.id,
        targetRole: plan,
        billingCycle: cycle,
      },
    },
  })

  return NextResponse.json({ url: checkoutSession.url })
}

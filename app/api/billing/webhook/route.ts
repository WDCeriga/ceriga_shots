import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { planNameToRole, syncUserSubscriptionByCustomer } from '@/lib/billing'
import { normalizeLabelCredits } from '@/lib/label-pricing'

export const runtime = 'nodejs'

function readNumberField(obj: Record<string, unknown>, key: string): number | null {
  const value = obj[key]
  return typeof value === 'number' ? value : null
}

function readStringField(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key]
  return typeof value === 'string' ? value : null
}

function readLabelCreditsFromMetadata(obj: Record<string, unknown> | undefined): number | null {
  if (!obj) return null
  const raw = obj['labelCredits']
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  return normalizeLabelCredits(raw)
}

function getSubscriptionPayload(subscription: Stripe.Subscription) {
  const firstItem = subscription.items.data[0]
  const subscriptionObj = subscription as unknown as Record<string, unknown>
  const periodEndUnix =
    readNumberField(subscriptionObj, 'current_period_end') ??
    readNumberField(firstItem as unknown as Record<string, unknown>, 'current_period_end')
  return {
    customerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    subscriptionId: subscription.id,
    priceId: firstItem?.price?.id ?? null,
    status: subscription.status,
    periodEndAt: periodEndUnix ? new Date(periodEndUnix * 1000) : null,
    roleOverride: planNameToRole(
      String(
        firstItem?.price?.metadata?.role ??
          (subscriptionObj['metadata'] as Record<string, unknown> | undefined)?.['targetRole'] ??
          ''
      )
    ),
    labelCreditsOverride:
      readLabelCreditsFromMetadata(firstItem?.price?.metadata as Record<string, unknown> | undefined) ??
      readLabelCreditsFromMetadata((subscriptionObj['metadata'] as Record<string, unknown> | undefined) ?? undefined),
  }
}

async function syncFromSubscriptionId(subscriptionId: string) {
  const stripe = getStripe()
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price'],
  })
  await syncUserSubscriptionByCustomer(getSubscriptionPayload(subscription))
}

export async function POST(req: Request) {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe webhook is not configured.' }, { status: 503 })
  }

  const stripe = getStripe()
  const signature = req.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Missing stripe-signature header.' }, { status: 400 })

  const payload = await req.text()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid webhook signature.'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.subscription && typeof session.subscription === 'string') {
          await syncFromSubscriptionId(session.subscription)
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await syncUserSubscriptionByCustomer(getSubscriptionPayload(subscription))
        break
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const invoiceObj = invoice as unknown as Record<string, unknown>
        const directSubscription = invoiceObj['subscription']
        const nestedSubscription = readStringField(
          (((invoiceObj['parent'] as Record<string, unknown> | undefined)?.['subscription_details'] as
            | Record<string, unknown>
            | undefined) ?? {}) as Record<string, unknown>,
          'subscription'
        )
        const subId =
          typeof directSubscription === 'string'
            ? directSubscription
            : (directSubscription as { id?: string } | null | undefined)?.id ?? nestedSubscription
        if (subId) {
          await syncFromSubscriptionId(subId)
        }
        break
      }
      default:
        break
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Stripe webhook sync error', error)
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 })
  }
}

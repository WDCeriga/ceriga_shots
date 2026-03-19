import { db, ensureSchema } from '@/lib/db'
import type { UserRole } from '@/lib/roles'
import { pricingPlans } from '@/lib/pricing'

export type BillingCycle = 'monthly' | 'yearly'
export type StripeSubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused'

export type BillingPlanRole = Exclude<UserRole, 'free' | 'admin'>

const ROLE_BY_PLAN_NAME: Record<string, BillingPlanRole> = {
  starter: 'starter',
  studio: 'studio',
  label: 'label',
}

const ACTIVE_SUBSCRIPTION_STATUSES = new Set<StripeSubscriptionStatus>(['active', 'trialing', 'past_due'])

export function planNameToRole(planName: string): BillingPlanRole | null {
  return ROLE_BY_PLAN_NAME[planName.trim().toLowerCase()] ?? null
}

export function getMonthlyPriceForRole(role: BillingPlanRole): number | null {
  const planName = role[0].toUpperCase() + role.slice(1)
  const plan = pricingPlans.find((p) => p.name === planName)
  return plan?.monthlyPrice ?? null
}

export function getDisplayedPriceForRoleCycle(role: BillingPlanRole, cycle: BillingCycle): number | null {
  const monthly = getMonthlyPriceForRole(role)
  if (monthly == null) return null
  if (cycle === 'monthly') return monthly
  return Math.round(monthly * 0.8)
}

export function getCheckoutUnitAmountCents(role: BillingPlanRole, cycle: BillingCycle): number | null {
  const monthly = getMonthlyPriceForRole(role)
  if (monthly == null) return null
  if (cycle === 'monthly') return Math.round(monthly * 100)

  const yearlyTotal = monthly * 12 * 0.8
  return Math.round(yearlyTotal * 100)
}

export function shouldBePaidRole(status: string | null | undefined): status is StripeSubscriptionStatus {
  if (!status) return false
  return ACTIVE_SUBSCRIPTION_STATUSES.has(status as StripeSubscriptionStatus)
}

type SubscriptionSyncInput = {
  customerId: string
  subscriptionId: string | null
  priceId: string | null
  status: string | null
  periodEndAt: Date | null
  roleOverride?: BillingPlanRole | null
}

type UserBillingRow = {
  id: string
  role: UserRole
  billing_period_ends_at: string | null
}

function toIso(value: Date | null): string | null {
  if (!value) return null
  return value.toISOString()
}

export async function syncUserSubscriptionByCustomer(input: SubscriptionSyncInput): Promise<void> {
  await ensureSchema()

  const users = (await db`
    select id, role, billing_period_ends_at
    from users
    where stripe_customer_id = ${input.customerId}
    limit 1
  `) as UserBillingRow[]
  const user = users[0]
  if (!user) return

  const roleFromPrice = input.roleOverride ?? null
  const isPaid = shouldBePaidRole(input.status)
  const nextRole: UserRole = isPaid && roleFromPrice ? roleFromPrice : 'free'
  const isAdmin = user.role === 'admin'

  const currentPeriodEnd = user.billing_period_ends_at ? new Date(user.billing_period_ends_at) : null
  const periodChanged =
    input.periodEndAt != null &&
    (currentPeriodEnd == null || currentPeriodEnd.getTime() !== input.periodEndAt.getTime())

  // Reset monthly usage when a paid cycle rolls over or when plan tier changes.
  const shouldResetCredits =
    !isAdmin &&
    isPaid &&
    (periodChanged || (nextRole !== 'free' && user.role !== nextRole))

  if (shouldResetCredits) {
    await db`
      update users
      set
        role = ${isAdmin ? user.role : nextRole},
        stripe_subscription_id = ${input.subscriptionId},
        stripe_price_id = ${input.priceId},
        stripe_subscription_status = ${input.status},
        billing_period_ends_at = ${toIso(input.periodEndAt)},
        credits_used = 0,
        credits_reset_at = ${toIso(input.periodEndAt)}
      where id = ${user.id}
    `
    return
  }

  await db`
    update users
    set
      role = ${isAdmin ? user.role : nextRole},
      stripe_subscription_id = ${input.subscriptionId},
      stripe_price_id = ${input.priceId},
      stripe_subscription_status = ${input.status},
      billing_period_ends_at = ${toIso(input.periodEndAt)}
    where id = ${user.id}
  `
}

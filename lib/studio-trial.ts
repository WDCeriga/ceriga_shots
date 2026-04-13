const DEFAULT_TRIAL_DAYS = 14
const STRIPE_MAX_TRIAL_DAYS = 730
const DEFAULT_TRIAL_CREDITS = 30

/**
 * Days of free trial for new Studio subscriptions (Stripe Checkout).
 * Set `NEXT_PUBLIC_STUDIO_TRIAL_DAYS` to `0` to disable the trial.
 */
export function getStudioTrialPeriodDays(): number | null {
  const raw = process.env.NEXT_PUBLIC_STUDIO_TRIAL_DAYS
  if (raw === '0') return null
  if (raw == null || raw === '') return DEFAULT_TRIAL_DAYS
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_TRIAL_DAYS
  return Math.min(Math.floor(n), STRIPE_MAX_TRIAL_DAYS)
}

/**
 * Credit allowance while a Studio subscription is in Stripe `trialing` status.
 * Set `NEXT_PUBLIC_STUDIO_TRIAL_CREDITS` to override (must be ≥ 1).
 */
export function getStudioTrialCreditsLimit(): number {
  const raw = process.env.NEXT_PUBLIC_STUDIO_TRIAL_CREDITS
  if (raw == null || raw === '') return DEFAULT_TRIAL_CREDITS
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_TRIAL_CREDITS
  return Math.min(Math.floor(n), 1_000_000)
}

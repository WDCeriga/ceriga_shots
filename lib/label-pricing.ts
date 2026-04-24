export const LABEL_BASE_CREDITS = 750
export const LABEL_BASE_MONTHLY_PRICE = 99
export const LABEL_MIN_CREDITS = 750
export const LABEL_MAX_CREDITS = 5000
export const LABEL_CREDITS_STEP = 250

export function normalizeLabelCredits(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return LABEL_BASE_CREDITS
  const roundedToStep = Math.round(n / LABEL_CREDITS_STEP) * LABEL_CREDITS_STEP
  return Math.min(LABEL_MAX_CREDITS, Math.max(LABEL_MIN_CREDITS, roundedToStep))
}

export function getLabelMonthlyPrice(credits: number): number {
  const normalized = normalizeLabelCredits(credits)
  return Math.round((LABEL_BASE_MONTHLY_PRICE * normalized) / LABEL_BASE_CREDITS)
}


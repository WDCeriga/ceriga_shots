import { db, ensureSchema } from '@/lib/db'
import { findUserById } from '@/lib/users'
import { getRoleLimits } from '@/lib/roles'
import type { UserRole } from '@/lib/roles'

export type CreditsInfo = {
  used: number
  limit: number
  remaining: number
  resetAt: Date | null
}

function nextMonthStart(): Date {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

function limitForRole(role: UserRole): number {
  const limits = getRoleLimits(role)
  return limits.credits < 0 ? 2147483647 : limits.credits
}

/**
 * Get current credits for a user. Resets credits_used if credits_reset_at has passed.
 * Returns { used, limit, remaining, resetAt }. limit -1 = unlimited (remaining is max int).
 */
export async function getCreditsForUser(userId: string): Promise<CreditsInfo | null> {
  const user = await findUserById(userId)
  if (!user) return null

  const role = user.role as UserRole
  const limits = getRoleLimits(role)
  const limit = limits.credits

  await ensureSchema()

  type Row = { credits_used: number; credits_reset_at: string | null }
  const rows = (await db`
    select credits_used, credits_reset_at
    from users
    where id = ${userId}
    limit 1
  `) as Row[]
  const row = rows[0]
  if (!row) return null

  let used = Number(row.credits_used ?? 0)
  let resetAt: Date | null = row.credits_reset_at ? new Date(row.credits_reset_at) : null

  const now = new Date()
  if (resetAt && resetAt <= now) {
    const nextReset = nextMonthStart()
    await db`
      update users
      set credits_used = 0, credits_reset_at = ${nextReset.toISOString()}
      where id = ${userId}
    `
    used = 0
    resetAt = nextReset
  } else if (!resetAt) {
    const nextReset = nextMonthStart()
    await db`
      update users
      set credits_reset_at = ${nextReset.toISOString()}
      where id = ${userId}
    `
    resetAt = nextReset
  }

  const remaining = limit < 0 ? Number.MAX_SAFE_INTEGER : Math.max(0, limit - used)
  return { used, limit, remaining, resetAt }
}

/**
 * Decrement credits by amount. Returns true if successful.
 * Uses atomic update with credits_limit check. Fails if remaining < amount.
 * Admin/unlimited roles always succeed.
 */
export async function decrementCredits(userId: string, amount: number): Promise<boolean> {
  if (amount <= 0) return true

  const user = await findUserById(userId)
  if (!user) return false

  const role = user.role as UserRole
  const limit = limitForRole(role)
  if (limit >= 2147483647) {
    return true
  }

  await ensureSchema()

  const updated = (await db`
    update users
    set credits_used = credits_used + ${amount}
    where id = ${userId}
      and credits_used + ${amount} <= ${limit}
    returning id
  `) as { id: string }[]

  return updated.length > 0
}

/**
 * Refund credits by amount (best-effort, capped at 0 floor).
 */
export async function incrementCredits(userId: string, amount: number): Promise<void> {
  if (amount <= 0) return
  await ensureSchema()
  await db`
    update users
    set credits_used = greatest(0, credits_used - ${amount})
    where id = ${userId}
  `
}

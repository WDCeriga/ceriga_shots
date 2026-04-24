import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { db, ensureSchema } from '@/lib/db'
import type { UserRole } from '@/lib/roles'

export type DbUserRow = {
  id: string
  email: string
  brand_name: string | null
  password_hash: string
  role: UserRole
  email_verified: boolean
  email_verification_token: string | null
  email_verification_token_expires: string | null
  password_reset_token: string | null
  password_reset_token_expires: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_price_id: string | null
  stripe_subscription_status: string | null
  billing_period_ends_at: string | null
  label_credits_limit: number | null
  last_sign_in_at: string | null
  last_used_at: string | null
  created_at: string
}

export async function findUserByEmail(email: string): Promise<DbUserRow | null> {
  const normalized = email.trim().toLowerCase()
  await ensureSchema()
  const rows = (await db`
    select *
    from users
    where lower(email) = ${normalized}
    limit 1
  `) as DbUserRow[]
  return rows[0] ?? null
}

export async function findUserById(id: string): Promise<DbUserRow | null> {
  await ensureSchema()
  const rows = (await db`
    select *
    from users
    where id = ${id}
    limit 1
  `) as DbUserRow[]
  return rows[0] ?? null
}

const ROLE_CACHE_TTL_MS = 5_000 // keep role updates nearly real-time
const roleCache = new Map<string, { role: UserRole; expiresAt: number }>()

/** Cached role lookup for session — avoids DB hit on every request */
export async function findUserRoleCached(id: string): Promise<UserRole | null> {
  const now = Date.now()
  const cached = roleCache.get(id)
  if (cached && cached.expiresAt > now) return cached.role

  const user = await findUserById(id)
  const role = user?.role ?? null
  if (role) roleCache.set(id, { role, expiresAt: now + ROLE_CACHE_TTL_MS })
  return role
}

export async function updateUserBrandName(id: string, brandName: string | null): Promise<DbUserRow | null> {
  await ensureSchema()
  const normalized =
    typeof brandName === 'string' && brandName.trim() !== '' ? brandName.trim() : null
  const rows = (await db`
    update users
    set brand_name = ${normalized}
    where id = ${id}
    returning *
  `) as DbUserRow[]
  return rows[0] ?? null
}

/** Random hash so OAuth-only accounts satisfy `password_hash not null` without a usable password. */
export async function findOrCreateOAuthUser(email: string): Promise<DbUserRow> {
  const normalizedEmail = email.trim().toLowerCase()
  await ensureSchema()

  const existing = await findUserByEmail(normalizedEmail)
  if (existing) {
    if (!existing.email_verified) {
      await db`
        update users
        set email_verified = true
        where id = ${existing.id}
      `
      const updated = await findUserById(existing.id)
      if (updated) return updated
    }
    return existing
  }

  const placeholderHash = await bcrypt.hash(`oauth|${crypto.randomUUID()}`, 12)
  const rows = (await db`
    insert into users (email, password_hash, email_verified)
    values (${normalizedEmail}, ${placeholderHash}, true)
    returning *
  `) as DbUserRow[]
  return rows[0]
}

export async function createUser(
  email: string,
  password: string,
  brandName?: string | null
): Promise<DbUserRow> {
  await ensureSchema()

  const normalizedEmail = email.trim().toLowerCase()
  const existing = await findUserByEmail(normalizedEmail)
  if (existing) {
    throw new Error('User already exists')
  }

  const hash = await bcrypt.hash(password, 12)
  const normalizedBrand =
    typeof brandName === 'string' && brandName.trim() !== '' ? brandName.trim() : null
  const rows = (await db`
    insert into users (email, brand_name, password_hash)
    values (${normalizedEmail}, ${normalizedBrand}, ${hash})
    returning *
  `) as DbUserRow[]
  return rows[0]
}

export async function verifyUser(email: string, password: string): Promise<DbUserRow | null> {
  const normalizedEmail = email.trim().toLowerCase()
  const user = await findUserByEmail(normalizedEmail)
  if (!user) return null
  const ok = await bcrypt.compare(password, user.password_hash)
  return ok ? user : null
}

export async function markUserSignedIn(id: string): Promise<void> {
  await ensureSchema()
  await db`
    update users
    set
      last_sign_in_at = now(),
      last_used_at = now()
    where id = ${id}
  `
}

export async function touchUserLastUsed(id: string): Promise<void> {
  await ensureSchema()
  await db`
    update users
    set last_used_at = now()
    where id = ${id}
  `
}

const VALID_ROLES: UserRole[] = ['free', 'starter', 'studio', 'label', 'admin']

export async function updateUserRole(id: string, role: UserRole): Promise<DbUserRow | null> {
  if (!VALID_ROLES.includes(role)) throw new Error(`Invalid role: ${role}`)
  await ensureSchema()
  const rows = (await db`
    update users
    set role = ${role}
    where id = ${id}
    returning *
  `) as DbUserRow[]
  return rows[0] ?? null
}

export async function setUserStripeCustomerId(id: string, customerId: string): Promise<DbUserRow | null> {
  await ensureSchema()
  const rows = (await db`
    update users
    set stripe_customer_id = ${customerId}
    where id = ${id}
    returning *
  `) as DbUserRow[]
  return rows[0] ?? null
}

export async function setEmailVerificationToken(
  userId: string,
  token: string,
  expiresAt: Date
): Promise<void> {
  await ensureSchema()
  await db`
    update users
    set email_verification_token = ${token},
        email_verification_token_expires = ${expiresAt.toISOString()}
    where id = ${userId}
  `
}

export async function verifyEmailByToken(token: string): Promise<DbUserRow | null> {
  await ensureSchema()
  const rows = (await db`
    select * from users
    where email_verification_token = ${token}
    limit 1
  `) as DbUserRow[]
  const user = rows[0]
  if (!user) return null

  if (
    user.email_verification_token_expires &&
    new Date(user.email_verification_token_expires) < new Date()
  ) {
    return null
  }

  const updated = (await db`
    update users
    set email_verified = true,
        email_verification_token = null,
        email_verification_token_expires = null
    where id = ${user.id}
    returning *
  `) as DbUserRow[]
  return updated[0] ?? null
}

export async function isEmailVerified(userId: string): Promise<boolean> {
  await ensureSchema()
  const rows = (await db`
    select email_verified from users where id = ${userId} limit 1
  `) as Array<{ email_verified: boolean }>
  return rows[0]?.email_verified ?? false
}

export async function setPasswordResetToken(
  userId: string,
  token: string,
  expiresAt: Date
): Promise<void> {
  await ensureSchema()
  await db`
    update users
    set password_reset_token = ${token},
        password_reset_token_expires = ${expiresAt.toISOString()}
    where id = ${userId}
  `
}

export async function verifyPasswordResetToken(token: string): Promise<DbUserRow | null> {
  await ensureSchema()
  const rows = (await db`
    select * from users
    where password_reset_token = ${token}
    limit 1
  `) as DbUserRow[]

  const user = rows[0]
  if (!user) return null

  if (user.password_reset_token_expires && new Date(user.password_reset_token_expires) < new Date()) {
    return null
  }

  return user
}

export async function updateUserPassword(userId: string, newPassword: string): Promise<void> {
  await ensureSchema()
  const hash = await bcrypt.hash(newPassword, 12)

  await db`
    update users
    set password_hash = ${hash},
        password_reset_token = null,
        password_reset_token_expires = null
    where id = ${userId}
  `
}


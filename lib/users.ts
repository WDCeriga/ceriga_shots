import bcrypt from 'bcryptjs'
import { db, ensureSchema } from '@/lib/db'
import type { UserRole } from '@/lib/roles'

export type DbUserRow = {
  id: string
  email: string
  brand_name: string | null
  password_hash: string
  role: UserRole
  created_at: string
}

export async function findUserByEmail(email: string): Promise<DbUserRow | null> {
  await ensureSchema()
  const rows = (await db`
    select *
    from users
    where email = ${email}
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

export async function createUser(
  email: string,
  password: string,
  brandName?: string | null
): Promise<DbUserRow> {
  await ensureSchema()

  const existing = await findUserByEmail(email)
  if (existing) {
    throw new Error('User already exists')
  }

  const hash = await bcrypt.hash(password, 12)
  const normalizedBrand =
    typeof brandName === 'string' && brandName.trim() !== '' ? brandName.trim() : null
  const rows = (await db`
    insert into users (email, brand_name, password_hash)
    values (${email}, ${normalizedBrand}, ${hash})
    returning *
  `) as DbUserRow[]
  return rows[0]
}

export async function verifyUser(email: string, password: string): Promise<DbUserRow | null> {
  const user = await findUserByEmail(email)
  if (!user) return null
  const ok = await bcrypt.compare(password, user.password_hash)
  return ok ? user : null
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


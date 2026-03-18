import bcrypt from 'bcryptjs'
import { db, ensureSchema } from '@/lib/db'

type DbUserRow = {
  id: string
  email: string
  password_hash: string
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

export async function createUser(email: string, password: string): Promise<DbUserRow> {
  await ensureSchema()

  const existing = await findUserByEmail(email)
  if (existing) {
    throw new Error('User already exists')
  }

  const hash = await bcrypt.hash(password, 12)
  const rows = (await db`
    insert into users (email, password_hash)
    values (${email}, ${hash})
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


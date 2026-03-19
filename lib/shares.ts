import { db, ensureSchema } from '@/lib/db'
import type { Project } from '@/hooks/use-projects'

type SharedProjectRow = {
  token: string
  project_id: string
  owner_id: string
  created_at: string
  revoked_at: string | null
  expires_at: string | null
  id: string
  name: string
  original_image: string
  original_image_name: string
  generated_images: unknown
  generation: unknown | null
  updated_at: string
}

export type ShareInfo = {
  token: string
  shareUrl: string
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
  revoked: boolean
  expired: boolean
}

export type ShareAuditEntry = {
  id: string
  action: string
  actorId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

function mapProject(row: Pick<SharedProjectRow, 'id' | 'name' | 'original_image' | 'original_image_name' | 'generated_images' | 'generation' | 'created_at' | 'updated_at'>): Project {
  return {
    id: row.id,
    name: row.name,
    originalImage: row.original_image,
    originalImageName: row.original_image_name,
    generatedImages: (row.generated_images as Project['generatedImages']) ?? [],
    generation: (row.generation as Project['generation']) ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

export type CreateShareOptions = {
  expiresAt?: Date | string | null
}

export async function createShareForProject(
  ownerId: string,
  projectId: string,
  options?: CreateShareOptions
): Promise<string> {
  await ensureSchema()
  const expiresAt = options?.expiresAt
    ? (typeof options.expiresAt === 'string'
        ? options.expiresAt
        : (options.expiresAt as Date).toISOString())
    : null

  const rows = (await db`
    insert into project_shares (project_id, owner_id, expires_at)
    values (${projectId}::uuid, ${ownerId}, ${expiresAt})
    returning token
  `) as Array<{ token: string }>
  const token = rows[0]!.token

  await logShareAudit(token, 'created', ownerId, { projectId, expiresAt })
  return token
}

export async function logShareAudit(
  token: string,
  action: string,
  actorId: string | null,
  metadata?: Record<string, unknown> | null
): Promise<void> {
  await ensureSchema()
  await db`
    insert into share_audit_log (share_token, action, actor_id, metadata)
    values (${token}::uuid, ${action}, ${actorId}, ${metadata ? JSON.stringify(metadata) : null}::jsonb)
  `
}

export async function getProjectForShareToken(token: string): Promise<Project | null> {
  await ensureSchema()
  const now = new Date().toISOString()
  const rows = (await db`
    select
      s.token,
      s.project_id,
      s.owner_id,
      s.created_at,
      s.revoked_at,
      s.expires_at,
      p.id,
      p.name,
      p.original_image,
      p.original_image_name,
      p.generated_images,
      p.generation,
      p.created_at,
      p.updated_at
    from project_shares s
    join projects p on p.id = s.project_id
    where s.token = ${token}::uuid
      and s.revoked_at is null
      and (s.expires_at is null or s.expires_at > ${now})
    limit 1
  `) as SharedProjectRow[]

  return rows[0] ? mapProject(rows[0]) : null
}

export async function revokeShare(token: string, ownerId: string): Promise<boolean> {
  await ensureSchema()
  const rows = (await db`
    update project_shares
    set revoked_at = now()
    where token = ${token}::uuid and owner_id = ${ownerId} and revoked_at is null
    returning token
  `) as Array<{ token: string }>
  if (rows.length > 0) {
    await logShareAudit(token, 'revoked', ownerId, {})
    return true
  }
  return false
}

export async function deleteRevokedShare(token: string, ownerId: string): Promise<boolean> {
  await ensureSchema()
  const rows = (await db`
    delete from project_shares
    where token = ${token}::uuid and owner_id = ${ownerId} and revoked_at is not null
    returning token
  `) as Array<{ token: string }>
  return rows.length > 0
}

export async function listSharesForProject(
  projectId: string,
  ownerId: string,
  baseUrl: string
): Promise<ShareInfo[]> {
  await ensureSchema()
  const now = new Date().toISOString()
  const rows = (await db`
    select token, created_at, expires_at, revoked_at
    from project_shares
    where project_id = ${projectId}::uuid and owner_id = ${ownerId}
    order by created_at desc
  `) as Array<{ token: string; created_at: string; expires_at: string | null; revoked_at: string | null }>

  const base = baseUrl.replace(/\/$/, '')
  return rows.map((r) => {
    const revoked = r.revoked_at != null
    const expired = r.expires_at != null && r.expires_at <= now
    return {
      token: r.token,
      shareUrl: `${base}/share/${r.token}`,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      revokedAt: r.revoked_at,
      revoked,
      expired,
    }
  })
}

export async function getShareAuditLog(
  token: string,
  ownerId: string
): Promise<ShareAuditEntry[]> {
  await ensureSchema()
  const rows = (await db`
    select
      a.id,
      a.action,
      a.actor_id,
      a.metadata,
      a.created_at
    from share_audit_log a
    join project_shares s on s.token = a.share_token
    where s.token = ${token}::uuid and s.owner_id = ${ownerId}
    order by a.created_at desc
    limit 100
  `) as Array<{ id: string; action: string; actor_id: string | null; metadata: unknown; created_at: string }>

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    actorId: r.actor_id,
    metadata: (r.metadata as Record<string, unknown>) ?? null,
    createdAt: r.created_at,
  }))
}


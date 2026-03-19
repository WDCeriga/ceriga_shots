import { neon } from '@neondatabase/serverless'

export function isDatabaseConfigured() {
  return process.env.DATABASE_URL != null && process.env.DATABASE_URL !== ''
}

// Lazily fail at query time rather than import time so type-check/build
// environments that don't load .env still succeed.
export const db =
  isDatabaseConfigured() ? neon(process.env.DATABASE_URL!)
    : ((() => {
        throw new Error('DATABASE_URL is not set')
      }) as unknown as ReturnType<typeof neon>)

let schemaReady = false
let schemaInitPromise: Promise<void> | null = null

export async function ensureSchema() {
  if (schemaReady) return
  if (schemaInitPromise) {
    await schemaInitPromise
    return
  }

  schemaInitPromise = (async () => {
    // Neon serverless prepared statements can't include multiple SQL commands.
    // Execute schema statements individually.
    await db`create extension if not exists pgcrypto`

    await db`
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      email text not null unique,
      brand_name text,
      password_hash text not null,
      created_at timestamptz not null default now()
    )
  `

    // Backfill/migrate older schemas.
    await db`alter table users add column if not exists brand_name text`
    await db`alter table users add column if not exists role text not null default 'free'`
    await db`alter table users add column if not exists credits_used integer not null default 0`
    await db`alter table users add column if not exists credits_reset_at timestamptz`

    await db`
    create table if not exists projects (
      id uuid primary key default gen_random_uuid(),
      owner_id text not null,
      name text not null,
      original_image text not null,
      original_image_name text not null,
      generated_images jsonb not null default '[]'::jsonb,
      generation jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `

    await db`create index if not exists projects_owner_id_idx on projects(owner_id)`

    await db`
    create table if not exists project_shares (
      token uuid primary key default gen_random_uuid(),
      project_id uuid not null references projects(id) on delete cascade,
      owner_id text not null,
      created_at timestamptz not null default now()
    )
  `
    await db`create index if not exists project_shares_project_id_idx on project_shares(project_id)`
    await db`create index if not exists project_shares_owner_id_idx on project_shares(owner_id)`

    await db`alter table project_shares add column if not exists revoked_at timestamptz`
    await db`alter table project_shares add column if not exists expires_at timestamptz`

    await db`
    create table if not exists share_audit_log (
      id uuid primary key default gen_random_uuid(),
      share_token uuid not null references project_shares(token) on delete cascade,
      action text not null,
      actor_id text,
      metadata jsonb,
      created_at timestamptz not null default now()
    )
  `
    await db`create index if not exists share_audit_log_share_token_idx on share_audit_log(share_token)`
    await db`create index if not exists share_audit_log_created_at_idx on share_audit_log(created_at)`

    await db`
    create table if not exists generation_jobs (
      id uuid primary key default gen_random_uuid(),
      owner_id text not null,
      project_id uuid not null references projects(id) on delete cascade,
      shot_type text not null,
      preset text not null,
      generation_index integer not null,
      variation_seed integer not null,
      status text not null default 'queued',
      attempts integer not null default 0,
      max_attempts integer not null default 3,
      run_after timestamptz not null default now(),
      locked_at timestamptz,
      locked_by text,
      error_message text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `
    await db`create index if not exists generation_jobs_status_run_after_idx on generation_jobs(status, run_after, created_at)`
    await db`create index if not exists generation_jobs_project_id_idx on generation_jobs(project_id)`
  })()

  try {
    await schemaInitPromise
    schemaReady = true
  } finally {
    schemaInitPromise = null
  }
}



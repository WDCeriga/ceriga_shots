import { neon } from '@neondatabase/serverless'

// Lazily fail at query time rather than import time so type-check/build
// environments that don't load .env still succeed.
export const db =
  process.env.DATABASE_URL != null && process.env.DATABASE_URL !== ''
    ? neon(process.env.DATABASE_URL)
    : ((() => {
        throw new Error('DATABASE_URL is not set')
      }) as unknown as ReturnType<typeof neon>)

export async function ensureSchema() {
  await db`
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      email text not null unique,
      password_hash text not null,
      created_at timestamptz not null default now()
    );

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
    );
    create index if not exists projects_owner_id_idx on projects(owner_id);
  `
}



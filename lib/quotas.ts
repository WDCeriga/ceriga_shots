import { getProjectsForUser } from '@/lib/projects'
import { getCreditsForUser } from '@/lib/credits'
import { getRoleLimits } from '@/lib/roles'
import type { UserRole } from '@/lib/roles'

const FLATLAY_TYPES = [
  'flatlay_topdown',
  'flatlay_45deg',
  'flatlay_sleeves',
  'flatlay_relaxed',
  'flatlay_folded',
] as const
const SURFACE_TYPES = ['surface_draped', 'surface_hanging'] as const
const DETAIL_TYPES = ['detail_print', 'detail_fabric', 'detail_collar'] as const

type ShotType =
  | (typeof FLATLAY_TYPES)[number]
  | (typeof SURFACE_TYPES)[number]
  | (typeof DETAIL_TYPES)[number]

export type QuotaError =
  | { code: 'max_projects'; limit: number }
  | { code: 'insufficient_credits'; required: number; remaining: number }
  | { code: 'shot_type_not_allowed'; shotType: string }
  | { code: 'preset_not_allowed'; preset: string }
  | { code: 'generate_more_disabled' }

export async function checkProjectLimit(
  userId: string,
  role: UserRole
): Promise<QuotaError | null> {
  const limits = getRoleLimits(role)
  if (limits.maxProjects < 0) return null

  const projects = await getProjectsForUser(userId)
  if (projects.length >= limits.maxProjects) {
    return { code: 'max_projects', limit: limits.maxProjects }
  }
  return null
}

export async function checkCreditsForBatch(
  userId: string,
  count: number
): Promise<QuotaError | null> {
  const info = await getCreditsForUser(userId)
  if (!info) return { code: 'insufficient_credits', required: count, remaining: 0 }
  if (info.remaining < count) {
    return { code: 'insufficient_credits', required: count, remaining: info.remaining }
  }
  return null
}

export function validateShotTypesForRole(
  role: UserRole,
  shotTypes: string[]
): QuotaError | null {
  const limits = getRoleLimits(role)

  if (!limits.surfaceShots) {
    for (const t of shotTypes) {
      if (SURFACE_TYPES.includes(t as (typeof SURFACE_TYPES)[number])) {
        return { code: 'shot_type_not_allowed', shotType: t }
      }
    }
  }

  if (limits.detailShots === 'none') {
    for (const t of shotTypes) {
      if (DETAIL_TYPES.includes(t as (typeof DETAIL_TYPES)[number])) {
        return { code: 'shot_type_not_allowed', shotType: t }
      }
    }
  } else if (limits.detailShots === 'print') {
    for (const t of shotTypes) {
      if (t === 'detail_fabric' || t === 'detail_collar') {
        return { code: 'shot_type_not_allowed', shotType: t }
      }
    }
  }

  const flatlayTypes = new Set(
    shotTypes.filter((t) => FLATLAY_TYPES.includes(t as (typeof FLATLAY_TYPES)[number]))
  )
  if (flatlayTypes.size > limits.flatLayTypes) {
    return { code: 'shot_type_not_allowed', shotType: 'flatlay (limit exceeded)' }
  }

  return null
}

export function validatePresetForRole(role: UserRole, preset: string): QuotaError | null {
  const limits = getRoleLimits(role)
  if (!limits.presets.includes(preset as (typeof limits.presets)[number])) {
    return { code: 'preset_not_allowed', preset }
  }
  return null
}

export function checkGenerateMore(role: UserRole): QuotaError | null {
  const limits = getRoleLimits(role)
  if (!limits.generateMore) return { code: 'generate_more_disabled' }
  return null
}

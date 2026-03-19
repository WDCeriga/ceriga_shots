import type { GeneratedImage, Project } from '@/types/projects'
import { getRoleLimits, type UserRole } from '@/lib/roles'

const DAY_MS = 24 * 60 * 60 * 1000

function toFiniteTimestamp(value: unknown): number | null {
  if (typeof value !== 'number') return null
  if (!Number.isFinite(value)) return null
  return value
}

export function getAssetRetentionDays(role: UserRole): number | null {
  const days = getRoleLimits(role).assetHistoryRetentionDays
  return days < 0 ? null : days
}

export function applyAssetRetentionToImages(
  images: GeneratedImage[],
  role: UserRole,
  nowMs = Date.now()
): { images: GeneratedImage[]; changed: boolean; removedCount: number } {
  const retentionDays = getAssetRetentionDays(role)
  if (retentionDays == null) {
    return { images, changed: false, removedCount: 0 }
  }

  const cutoff = nowMs - retentionDays * DAY_MS
  const kept = images.filter((img) => {
    const ts = toFiniteTimestamp(img.timestamp)
    // Keep records with missing/invalid timestamps to avoid accidental data loss.
    if (ts == null) return true
    return ts >= cutoff
  })

  return {
    images: kept,
    changed: kept.length !== images.length,
    removedCount: Math.max(0, images.length - kept.length),
  }
}

export function applyAssetRetentionToProject(
  project: Project,
  role: UserRole,
  nowMs = Date.now()
): { project: Project; changed: boolean; removedCount: number } {
  const result = applyAssetRetentionToImages(project.generatedImages ?? [], role, nowMs)
  if (!result.changed) {
    return { project, changed: false, removedCount: 0 }
  }
  return {
    project: {
      ...project,
      generatedImages: result.images,
    },
    changed: true,
    removedCount: result.removedCount,
  }
}

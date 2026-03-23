import type { Project } from '@/types/projects'

/**
 * Merges client/server updates into `generation` JSON without dropping
 * fields omitted from partial patches (preset, shotTypes, pipeline, garmentType).
 */
export function mergeGeneration(
  current: Project['generation'] | undefined,
  incoming: Project['generation'] | undefined
): Project['generation'] | undefined {
  if (!incoming) return current
  if (!current) return incoming

  const merged: NonNullable<Project['generation']> = {
    ...current,
    ...incoming,
    total: Math.max(current.total ?? 0, incoming.total ?? 0),
    completed: Math.max(current.completed ?? 0, incoming.completed ?? 0),
    shotTypes: incoming.shotTypes ?? current.shotTypes,
    preset: incoming.preset ?? current.preset,
    pipeline: incoming.pipeline ?? current.pipeline,
    garmentType: incoming.garmentType ?? current.garmentType,
  }

  const totalIncreased =
    typeof current.total === 'number' &&
    typeof incoming.total === 'number' &&
    incoming.total > current.total

  if (current.status === 'complete' && incoming.status !== 'complete' && !totalIncreased) {
    merged.status = 'complete'
    merged.nextType = undefined
    merged.errorMessage = undefined
    merged.completed = Math.max(merged.completed, merged.total)
  }

  if (merged.completed >= merged.total && merged.total > 0) {
    merged.status = 'complete'
    merged.completed = merged.total
    merged.nextType = undefined
    merged.errorMessage = undefined
  }

  if (incoming.status === 'error') {
    merged.status = 'error'
    merged.errorMessage = incoming.errorMessage ?? current.errorMessage
  }

  return merged
}

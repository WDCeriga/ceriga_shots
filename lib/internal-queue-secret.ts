/**
 * Shared secret for server-to-server calls (dispatch → `/api/mockups`).
 * Browser traffic to mockups is allowed via session JWT in middleware instead.
 *
 * In development, when `INTERNAL_QUEUE_SECRET` is unset, a fixed default is used
 * so local runs work without copying production secrets. Production must set
 * `INTERNAL_QUEUE_SECRET` (or rely on `QUEUE_DISPATCH_SECRET` / `CRON_SECRET`).
 */
export function getInternalQueueSecret(): string | undefined {
  const fromEnv = process.env.INTERNAL_QUEUE_SECRET?.trim()
  if (fromEnv) return fromEnv
  if (process.env.NODE_ENV === 'development') {
    return '__ceriga_dev_internal_queue__'
  }
  return undefined
}

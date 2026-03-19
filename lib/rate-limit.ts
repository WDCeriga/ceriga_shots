type LimitResult = {
  ok: boolean
  remaining: number
  limit: number
  retryAfterSeconds: number
}

type LimitConfig = {
  key: string
  limit: number
  windowSeconds: number
}

type MemoryBucket = {
  count: number
  resetAt: number
}

const memoryStore = new Map<string, MemoryBucket>()

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9:_-]/g, '_')
}

function nowMs() {
  return Date.now()
}

function memoryLimit(config: LimitConfig): LimitResult {
  const key = sanitizeKey(config.key)
  const now = nowMs()
  const windowMs = config.windowSeconds * 1000
  const prev = memoryStore.get(key)

  if (!prev || now >= prev.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs })
    return {
      ok: true,
      remaining: Math.max(0, config.limit - 1),
      limit: config.limit,
      retryAfterSeconds: config.windowSeconds,
    }
  }

  const nextCount = prev.count + 1
  prev.count = nextCount
  memoryStore.set(key, prev)

  const retryAfterSeconds = Math.max(1, Math.ceil((prev.resetAt - now) / 1000))
  const remaining = Math.max(0, config.limit - nextCount)

  return {
    ok: nextCount <= config.limit,
    remaining,
    limit: config.limit,
    retryAfterSeconds,
  }
}

async function upstashLimit(config: LimitConfig): Promise<LimitResult | null> {
  const baseUrl = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!baseUrl || !token) return null

  const key = sanitizeKey(config.key)
  const headers = { Authorization: `Bearer ${token}` }
  const incrRes = await fetch(`${baseUrl}/incr/${encodeURIComponent(key)}`, { method: 'POST', headers })
  if (!incrRes.ok) return null
  const incrJson = (await incrRes.json().catch(() => ({}))) as { result?: number | string }
  const count = Number(incrJson.result ?? 0)
  if (!Number.isFinite(count) || count <= 0) return null

  if (count === 1) {
    // Start TTL on first hit in this window.
    await fetch(`${baseUrl}/expire/${encodeURIComponent(key)}/${config.windowSeconds}`, {
      method: 'POST',
      headers,
    }).catch(() => {})
  }

  if (count > config.limit) {
    return {
      ok: false,
      remaining: 0,
      limit: config.limit,
      retryAfterSeconds: config.windowSeconds,
    }
  }

  return {
    ok: true,
    remaining: Math.max(0, config.limit - count),
    limit: config.limit,
    retryAfterSeconds: config.windowSeconds,
  }
}

export async function applyRateLimit(config: LimitConfig): Promise<LimitResult> {
  const remote = await upstashLimit(config).catch(() => null)
  if (remote) return remote
  return memoryLimit(config)
}

export function getRequestIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip') || 'unknown'
}

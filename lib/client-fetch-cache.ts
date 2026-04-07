'use client'

type CacheEntry<T> = {
  value: T
  expiresAt: number
}

const memoryCache = new Map<string, CacheEntry<unknown>>()

function storageKey(key: string) {
  return `fetch-cache:${key}`
}

function readSessionCache<T>(key: string): CacheEntry<T> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(storageKey(key))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry<T>
    if (!parsed || typeof parsed.expiresAt !== 'number') return null
    if (Date.now() > parsed.expiresAt) return null
    return parsed
  } catch {
    return null
  }
}

function writeSessionCache<T>(key: string, entry: CacheEntry<T>) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(entry))
  } catch {
    // Ignore storage errors (quota/private mode/etc.)
  }
}

export function invalidateJsonCache(key: string) {
  memoryCache.delete(key)
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(storageKey(key))
    } catch {
      // Ignore storage errors.
    }
  }
}

export function peekJsonCache<T>(key: string): T | null {
  const now = Date.now()
  const memory = memoryCache.get(key) as CacheEntry<T> | undefined
  if (memory && now <= memory.expiresAt) return memory.value
  const session = readSessionCache<T>(key)
  if (session) {
    memoryCache.set(key, session)
    return session.value
  }
  return null
}

export async function fetchJsonCached<T>(
  key: string,
  url: string,
  options?: { ttlMs?: number; init?: RequestInit }
): Promise<T> {
  const ttlMs = options?.ttlMs ?? 15_000
  const now = Date.now()
  const memory = memoryCache.get(key) as CacheEntry<T> | undefined
  if (memory && now <= memory.expiresAt) return memory.value

  const session = readSessionCache<T>(key)
  if (session) {
    memoryCache.set(key, session)
    return session.value
  }

  const res = await fetch(url, options?.init)
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const data = (await res.json()) as { error?: unknown }
      if (typeof data?.error === 'string' && data.error.trim()) message = data.error
    } catch {
      // ignore json parse failure
    }
    throw new Error(message)
  }

  const value = (await res.json()) as T
  const entry: CacheEntry<T> = { value, expiresAt: now + ttlMs }
  memoryCache.set(key, entry)
  writeSessionCache(key, entry)
  return value
}


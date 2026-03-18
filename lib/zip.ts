function parseDataUrl(dataUrl: string): { mime: string; base64: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!match) return null
  return { mime: match[1]!, base64: match[2]! }
}

function extFromMime(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/heic':
      return 'heic'
    case 'image/heif':
      return 'heif'
    default:
      return 'bin'
  }
}

export function bufferFromDataUrl(dataUrl: string): { buffer: Buffer; ext: string; mime: string } | null {
  const parsed = parseDataUrl(dataUrl)
  if (!parsed) return null
  return { buffer: Buffer.from(parsed.base64, 'base64'), ext: extFromMime(parsed.mime), mime: parsed.mime }
}

export async function bufferFromImageRef(
  ref: string
): Promise<{ buffer: Buffer; ext: string; mime: string } | null> {
  if (!ref) return null

  const asData = bufferFromDataUrl(ref)
  if (asData) return asData

  if (!/^https?:\/\//i.test(ref)) return null

  let res: Response
  try {
    res = await fetch(ref)
  } catch {
    res = null as any
  }
  if (res && res.ok) {
    const mime = res.headers.get('content-type') || 'application/octet-stream'
    const ab = await res.arrayBuffer()
    return { buffer: Buffer.from(ab), ext: extFromMime(mime), mime }
  }

  // Fallback: if this is an R2 public URL (or custom public base),
  // allow fetching the object via credentials (works for private buckets).
  try {
    const { getObjectFromR2, isR2Configured, r2KeyFromPublicUrl } = await import('@/lib/r2')
    if (isR2Configured()) {
      const key = r2KeyFromPublicUrl(ref)
      if (key) {
        const obj = await getObjectFromR2(key)
        const mime = obj.contentType || 'application/octet-stream'
        return { buffer: obj.body, ext: extFromMime(mime), mime }
      }
    }
  } catch {
    // ignore
  }

  return null
}

export function safeFilename(name: string): string {
  const trimmed = name.trim() || 'file'
  return trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
}


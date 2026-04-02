'use client'

const MAX_UPLOAD_BYTES = 4_000_000 // Leave headroom under Vercel's ~4.5MB function payload limit.
const MAX_IMAGE_DIMENSION = 2000
const GENERATION_SOURCE_MAX_DIMENSION = 1536

function isCompressibleType(mime: string): boolean {
  const t = mime.toLowerCase().trim()
  return t === 'image/png' || t === 'image/jpeg' || t === 'image/webp'
}

async function decodeImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Failed to decode image'))
    })
    img.src = objectUrl
    await loaded
    return img
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function compressImageIfNeeded(file: File): Promise<File> {
  if (file.size <= MAX_UPLOAD_BYTES) return file

  const mime = file.type || ''
  if (!mime || !isCompressibleType(mime)) return file

  const img = await decodeImage(file)
  const { width, height } = img
  if (!width || !height) return file

  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height))
  const targetW = Math.max(1, Math.round(width * scale))
  const targetH = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')
  if (!ctx) return file

  ctx.drawImage(img, 0, 0, targetW, targetH)

  async function toBlob(type: string, quality: number): Promise<Blob | null> {
    return await new Promise((resolve) => canvas.toBlob(resolve, type, quality))
  }

  // Try WebP first.
  let blob = await toBlob('image/webp', 0.82)
  let outMime = 'image/webp'

  // Fallback to JPEG.
  if (!blob) {
    blob = await toBlob('image/jpeg', 0.85)
    outMime = 'image/jpeg'
  }

  if (!blob) return file

  // If the re-encoded file is still too big, keep the original rather than looping.
  // (This keeps the UX simple; the upload error will be handled by the caller.)
  if (blob.size > MAX_UPLOAD_BYTES * 2) return file

  const base = (file.name || 'original').replace(/\.[^/.]+$/, '') || 'original'
  const ext = outMime === 'image/png' ? 'png' : outMime === 'image/jpeg' ? 'jpg' : 'webp'
  return new File([blob], `${base}.${ext}`, { type: outMime })
}

export async function uploadOriginalImageToR2(file: File): Promise<string> {
  const uploadFile = await compressImageIfNeeded(file)
  const form = new FormData()
  form.append('file', uploadFile, uploadFile.name)

  const res = await fetch('/api/r2/original-upload', {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    const message = await res.text().catch(() => '')
    throw new Error(message || `Upload failed (${res.status})`)
  }

  const data = (await res.json()) as { url?: string }
  if (!data.url) throw new Error('Upload succeeded but no URL returned.')
  return data.url
}

async function createGenerationSourceFile(file: File): Promise<File> {
  const mime = file.type || ''
  if (!mime || !isCompressibleType(mime)) {
    // If we can't reliably decode/encode, fall back to the original.
    return file
  }

  const img = await decodeImage(file)
  const { width, height } = img
  if (!width || !height) return file

  const scale = Math.min(1, GENERATION_SOURCE_MAX_DIMENSION / Math.max(width, height))
  const targetW = Math.max(1, Math.round(width * scale))
  const targetH = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')
  if (!ctx) return file

  ctx.drawImage(img, 0, 0, targetW, targetH)

  async function toBlob(type: string, quality: number): Promise<Blob | null> {
    return await new Promise((resolve) => canvas.toBlob(resolve, type, quality))
  }

  // Prefer WebP to reduce bytes; fallback to JPEG.
  let blob = await toBlob('image/webp', 0.78)
  let outMime = 'image/webp'
  if (!blob) {
    blob = await toBlob('image/jpeg', 0.82)
    outMime = 'image/jpeg'
  }
  if (!blob) return file

  const base = (file.name || 'source').replace(/\.[^/.]+$/, '') || 'source'
  const ext = outMime === 'image/jpeg' ? 'jpg' : 'webp'
  return new File([blob], `${base}-source.${ext}`, { type: outMime })
}

export async function uploadGenerationSourceImageToR2(file: File): Promise<string> {
  const sourceFile = await createGenerationSourceFile(file)
  const form = new FormData()
  form.append('file', sourceFile, sourceFile.name)

  const res = await fetch('/api/r2/generation-source-upload', {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    const message = await res.text().catch(() => '')
    throw new Error(message || `Source upload failed (${res.status})`)
  }

  const data = (await res.json()) as { url?: string }
  if (!data.url) throw new Error('Source upload succeeded but no URL returned.')
  return data.url
}


/**
 * Client-only helpers for in-browser background removal (@imgly/background-removal).
 * Import only from client components.
 */

const MAX_RESULT_DATA_URL_CHARS = 3_500_000

async function compositeBlobOnWhite(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bmp.close()
    throw new Error('Canvas not supported')
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0)
  bmp.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode image'))),
      'image/png',
      0.92
    )
  })
}

async function resizeBlobMaxEdge(blob: Blob, maxEdge: number): Promise<Blob> {
  const bmp = await createImageBitmap(blob)
  const w = bmp.width
  const h = bmp.height
  const longest = Math.max(w, h)
  if (longest <= maxEdge) {
    bmp.close()
    return blob
  }
  const scale = maxEdge / longest
  const nw = Math.max(1, Math.round(w * scale))
  const nh = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = nw
  canvas.height = nh
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bmp.close()
    throw new Error('Canvas not supported')
  }
  ctx.drawImage(bmp, 0, 0, nw, nh)
  bmp.close()
  const outMime = blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
  const quality = outMime === 'image/jpeg' ? 0.88 : 0.92
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to resize image'))),
      outMime,
      quality
    )
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(fr.error ?? new Error('read failed'))
    fr.readAsDataURL(blob)
  })
}

export type BackgroundRemoveOutputMode = 'transparent' | 'white'

/**
 * Shared @imgly/background-removal options: WebGPU when available, worker thread.
 * `isnet_fp16` = medium model (~80MB class), good speed/quality balance.
 * Use `isnet` for heavier quality or `isnet_quint8` (~40MB) for speed (more artifacts).
 */
export const backgroundRemovalInferenceConfig = {
  model: 'isnet_fp16' as const,
  device: 'gpu' as const,
  proxyToWorker: true,
  output: { format: 'image/png' as const, quality: 0.92 },
}

/**
 * Prefetch WASM + model so the first removeBackground call after navigation is faster.
 * Safe to call multiple times; failures are non-fatal.
 */
export async function preloadBackgroundRemovalAssets(): Promise<void> {
  const { preload } = await import('@imgly/background-removal')
  await preload(backgroundRemovalInferenceConfig)
}

/**
 * Runs WASM background removal, optional white backdrop, then scales down so the
 * data URL fits typical serverless request body limits.
 */
export async function removeBackgroundToDataUrl(
  source: File | Blob,
  outputMode: BackgroundRemoveOutputMode
): Promise<string> {
  const { removeBackground } = await import('@imgly/background-removal')

  let blob = await removeBackground(source, backgroundRemovalInferenceConfig)

  if (outputMode === 'white') {
    blob = await compositeBlobOnWhite(blob)
  }

  let maxEdge = 2048
  for (let attempt = 0; attempt < 12; attempt++) {
    const scaled = await resizeBlobMaxEdge(blob, maxEdge)
    const dataUrl = await blobToDataUrl(scaled)
    if (dataUrl.length <= MAX_RESULT_DATA_URL_CHARS) {
      return dataUrl
    }
    blob = scaled
    const bmp = await createImageBitmap(blob)
    const longest = Math.max(bmp.width, bmp.height)
    bmp.close()
    const next = Math.min(Math.max(128, longest - 1), Math.floor(maxEdge * 0.75))
    maxEdge = next
  }

  return blobToDataUrl(await resizeBlobMaxEdge(blob, 128))
}

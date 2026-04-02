import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isR2Configured, putObjectToR2 } from '@/lib/r2'

function extFromMime(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    default:
      return 'bin'
  }
}

function safeBaseName(input: string): string {
  const trimmed = input.trim()
  const base = trimmed.replace(/\.[^/.]+$/, '') || 'source'
  return base.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').slice(0, 120) || 'source'
}

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isR2Configured()) {
    return NextResponse.json({ error: 'Image storage (R2) is not configured' }, { status: 503 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 })
  }

  const fileEntry = formData.get('file')
  if (!fileEntry) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }

  const file = fileEntry as unknown as {
    name?: string
    type?: string
    arrayBuffer: () => Promise<ArrayBuffer>
  }

  if (typeof file.arrayBuffer !== 'function') {
    return NextResponse.json({ error: 'Invalid file' }, { status: 400 })
  }

  const userId = session.user.id
  const contentType = typeof file.type === 'string' && file.type.trim().length > 0 ? file.type : 'application/octet-stream'
  const inputName = typeof file.name === 'string' && file.name.trim().length > 0 ? file.name : 'source'
  const ext = extFromMime(contentType)
  const safeBase = safeBaseName(inputName)

  const bytes = new Uint8Array(await file.arrayBuffer())

  const key = `users/${userId}/source/${
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now()
  }-${safeBase}.${ext}`

  const uploaded = await putObjectToR2({
    key,
    body: bytes,
    contentType,
    cacheControl: 'public, max-age=31536000, immutable',
  })

  return NextResponse.json({ url: uploaded.url })
}


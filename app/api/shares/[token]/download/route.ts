import JSZip from 'jszip'
import { NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { getProjectForShareToken } from '@/lib/shares'
import { bufferFromImageRef, safeFilename } from '@/lib/zip'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.pathname.split('/').slice(-2)[0] as string

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: 'Database is not configured (missing DATABASE_URL).' },
      { status: 503 }
    )
  }

  const project = await getProjectForShareToken(token)
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const zip = new JSZip()

  const original = await bufferFromImageRef(project.originalImage)
  if (original) {
    const base = safeFilename(project.originalImageName || 'original')
    zip.file(`original/${base}.${original.ext}`, original.buffer, { binary: true })
  }

  for (const img of project.generatedImages) {
    const data = await bufferFromImageRef(img.url)
    if (!data) continue
    const ts = typeof img.timestamp === 'number' ? img.timestamp : Date.now()
    const label = safeFilename(`${img.type}-${img.id}-${ts}`)
    zip.file(`generated/${label}.${data.ext}`, data.buffer, { binary: true })
  }

  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  const filename = `${safeFilename(project.name)}.zip`

  return new NextResponse(out, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}


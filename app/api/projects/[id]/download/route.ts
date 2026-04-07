import JSZip from 'jszip'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDatabaseConfigured } from '@/lib/db'
import { getProjectForUser, updateProjectForUser } from '@/lib/projects'
import { bufferFromImageRef, safeFilename } from '@/lib/zip'
import { findUserById } from '@/lib/users'
import type { UserRole } from '@/lib/roles'
import { applyAssetRetentionToProject } from '@/lib/asset-retention'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const id = url.pathname.split('/').slice(-2)[0] as string
  const formatParam = (url.searchParams.get('format') ?? 'original').toLowerCase()
  const requestedFormat: 'original' | 'png' | 'jpeg' | 'webp' =
    formatParam === 'png' || formatParam === 'jpeg' || formatParam === 'webp'
      ? formatParam
      : 'original'
  const selectedAssetIdsRaw = url.searchParams.get('assetIds')
  const selectedAssetIds = new Set(
    (selectedAssetIdsRaw ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
  )
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: 'Database is not configured (missing DATABASE_URL).' },
      { status: 503 }
    )
  }

  const rawProject = await getProjectForUser(session.user.id, id)
  if (!rawProject) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const user = await findUserById(session.user.id)
  const role = (user?.role ?? 'free') as UserRole
  const retained = applyAssetRetentionToProject(rawProject, role)
  const project = retained.changed
    ? (await updateProjectForUser(session.user.id, id, {
        generatedImages: retained.project.generatedImages,
      })) ?? retained.project
    : rawProject

  const zip = new JSZip()
  let filesAdded = 0

  const matchesRequestedFormat = (mime: string): boolean => {
    if (requestedFormat === 'original') return true
    const normalized = mime.split(';')[0]?.trim().toLowerCase() ?? ''
    if (requestedFormat === 'png') return normalized === 'image/png'
    if (requestedFormat === 'jpeg') return normalized === 'image/jpeg'
    return normalized === 'image/webp'
  }

  const original = await bufferFromImageRef(project.originalImage)
  if (original && matchesRequestedFormat(original.mime)) {
    const base = safeFilename(project.originalImageName || 'original')
    zip.file(`original/${base}.${original.ext}`, original.buffer, { binary: true })
    filesAdded += 1
  }

  const generatedToZip =
    selectedAssetIds.size > 0
      ? project.generatedImages.filter((img) => selectedAssetIds.has(img.id))
      : project.generatedImages

  for (const img of generatedToZip) {
    const data = await bufferFromImageRef(img.url)
    if (!data) continue
    if (!matchesRequestedFormat(data.mime)) continue
    const ts = typeof img.timestamp === 'number' ? img.timestamp : Date.now()
    const label = safeFilename(`${img.type}-${img.id}-${ts}`)
    zip.file(`generated/${label}.${data.ext}`, data.buffer, { binary: true })
    filesAdded += 1
  }

  if (filesAdded === 0) {
    return NextResponse.json(
      { error: `No downloadable assets found for format "${requestedFormat}".` },
      { status: 400 }
    )
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


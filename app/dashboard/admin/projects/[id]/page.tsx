'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { Project } from '@/types/projects'
import { Button } from '@/components/ui/button'
import { LightboxAsset, LightboxImage } from '@/components/lightbox-image'

type ResponseShape = {
  project?: Project
  owner?: { id: string; email: string }
  error?: string
}

function formatViewTitle(t: string) {
  switch (t) {
    case 'flat-lay':
    case 'flatlay_topdown':
      return 'Top-down flat lay'
    case 'flatlay_45deg':
      return 'Diagonal overhead flat lay'
    case 'flatlay_sleeves':
      return 'Sleeve spread'
    case 'flatlay_relaxed':
      return 'Relaxed flat lay'
    case 'flatlay_folded':
      return 'Folded retail shot'
    case 'product-shot':
    case 'surface_hanging':
      return 'Hanging shot'
    case 'surface_draped':
      return 'Draped over surface'
    case 'detail':
    case 'detail_print':
      return 'Print close-up'
    case 'detail_fabric':
      return 'Fabric macro'
    case 'lifestyle':
      return 'Lifestyle'
    case 'detail_collar':
      return 'Collar detail'
    default:
      return t
  }
}

function formatPipelineLabel(pipeline?: string) {
  switch (pipeline) {
    case 'design_realize':
      return 'Sketch-to-3D Mockups'
    case 'background_remove':
      return 'Background remover'
    case 'garment_photo':
      return 'Product Shots'
    default:
      return pipeline ?? '—'
  }
}

function formatPresetLabel(preset?: string) {
  if (!preset) return '—'
  return preset
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export default function AdminProjectDetailPage() {
  const params = useParams()
  const projectId = params.id as string
  const [project, setProject] = useState<Project | null>(null)
  const [ownerEmail, setOwnerEmail] = useState<string>('Unknown')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/projects/${projectId}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as ResponseShape
        if (!res.ok || !data.project) throw new Error(data.error || 'Failed to load project')
        setProject(data.project)
        setOwnerEmail(data.owner?.email ?? 'Unknown')
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load project'))
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading project...</div>
  }

  if (error || !project) {
    return (
      <div className="p-8">
        <p className="text-sm text-destructive">{error ?? 'Project not found'}</p>
        <Link href="/dashboard/admin/projects"><Button variant="outline" className="mt-4">Back to All Projects</Button></Link>
      </div>
    )
  }

  const generation = project.generation
  const generationReferenceImages = (() => {
    const multi = Array.isArray(generation?.sourceImageUrls)
      ? generation.sourceImageUrls.filter((url) => typeof url === 'string' && url.trim().length > 0)
      : []
    if (multi.length > 0) return multi
    const single = generation?.sourceImageUrl
    if (single && single.trim().length > 0) return [single]
    return [project.originalImage]
  })()

  const generationDetails: Array<{ label: string; value: string }> = [
    { label: 'Status', value: generation?.status ?? 'idle' },
    {
      label: 'Progress',
      value:
        typeof generation?.completed === 'number' && typeof generation?.total === 'number'
          ? `${generation.completed}/${generation.total}`
          : '—',
    },
    { label: 'Pipeline', value: formatPipelineLabel(generation?.pipeline) },
    { label: 'Preset', value: formatPresetLabel(generation?.preset) },
    { label: 'Aspect ratio', value: generation?.aspectRatio ?? '1:1' },
    { label: 'Render style', value: generation?.renderStyleLevel ?? '—' },
    { label: 'Garment type', value: generation?.garmentType ?? '—' },
    {
      label: 'Shot types',
      value:
        Array.isArray(generation?.shotTypes) && generation.shotTypes.length > 0
          ? generation.shotTypes.map((shot) => formatViewTitle(shot)).join(', ')
          : '—',
    },
    {
      label: 'Next type',
      value: generation?.nextType ? formatViewTitle(generation.nextType) : '—',
    },
    {
      label: 'Error message',
      value: generation?.errorMessage?.trim() ? generation.errorMessage : '—',
    },
  ]

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight truncate">{project.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Owner: {ownerEmail}
            <span className="mx-2">•</span>
            {project.generatedImages.length} generated assets
          </p>
        </div>
        <Link href="/dashboard/admin/projects">
          <Button variant="outline">Back to All Projects</Button>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr] lg:items-start">
        <aside className="space-y-4">
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="p-4 border-b border-border">
              <h2 className="text-base font-semibold">Original</h2>
              <p className="text-xs text-muted-foreground mt-1">{project.originalImageName}</p>
            </div>
            <div className="p-4">
              <div className="rounded-lg overflow-hidden border border-border">
                <img src={project.originalImage} alt="Original design" className="w-full aspect-square object-cover" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="p-4 border-b border-border">
              <h2 className="text-base font-semibold">Generation details</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Full options selected for this generation.
              </p>
            </div>
            <div className="p-4">
              <dl className="space-y-2">
                {generationDetails.map((detail) => (
                  <div key={detail.label} className="flex items-start justify-between gap-3 text-xs">
                    <dt className="text-muted-foreground">{detail.label}</dt>
                    <dd className="text-right text-foreground max-w-[62%] break-words">{detail.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="p-4 border-b border-border">
              <h2 className="text-base font-semibold">Reference images used</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Every image that was sent as generation input.
              </p>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-2">
                {generationReferenceImages.map((refUrl, idx) => (
                  <div
                    key={`${refUrl}-${idx}`}
                    className="rounded-md overflow-hidden border border-border bg-secondary/40"
                  >
                    <img
                      src={refUrl}
                      alt={`Generation reference ${idx + 1}`}
                      className="w-full aspect-square object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Generated Assets</h2>
            <p className="text-xs text-muted-foreground">{project.generatedImages.length ? 'Ready' : 'No outputs'}</p>
          </div>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
            {project.generatedImages.map((img) => (
              <div key={img.id} className="rounded-xl overflow-hidden border border-border bg-card">
                {img.url ? (
                  <LightboxImage
                    src={img.url}
                    alt={img.type}
                    title={formatViewTitle(img.type)}
                    imgClassName="w-full aspect-square object-cover"
                  />
                ) : (
                  <LightboxAsset title={formatViewTitle(img.type)} prompt={img.prompt}>
                    <div className="w-full aspect-square flex items-center justify-center bg-secondary/50">
                      <p className="text-sm font-medium text-muted-foreground">{formatViewTitle(img.type)}</p>
                    </div>
                  </LightboxAsset>
                )}
                <div className="px-3 py-2 border-t border-border">
                  <p className="text-xs text-muted-foreground text-center">{formatViewTitle(img.type)}</p>
                </div>
                <div className="border-t border-border px-3 py-2">
                  <details>
                    <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Prompt used
                    </summary>
                    {img.prompt && img.prompt.trim().length > 0 ? (
                      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border/70 bg-background/60 p-2 text-[11px] leading-relaxed text-foreground">
                        {img.prompt}
                      </pre>
                    ) : (
                      <p className="mt-2 text-[11px] text-muted-foreground">No prompt stored for this asset.</p>
                    )}
                  </details>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

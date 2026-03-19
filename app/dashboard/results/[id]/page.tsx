'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useProjects } from '@/hooks/use-projects'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Check, ChevronLeft, ChevronRight, Pencil, X } from 'lucide-react'
import { ShareDialog } from '@/components/share-dialog'
import { toast } from '@/hooks/use-toast'
import { LightboxAsset } from '@/components/lightbox-image'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useRole } from '@/hooks/use-role'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

export default function ResultsPage() {
  const params = useParams()
  const projectId = params.id as string
  const { getProject, fetchProject, updateProject } = useProjects()
  const { role, limits } = useRole()
  const project = getProject(projectId)
  const [isDownloading, setIsDownloading] = useState(false)
  const [moreType, setMoreType] = useState<
    | 'flatlay_topdown'
    | 'flatlay_45deg'
    | 'flatlay_sleeves'
    | 'flatlay_relaxed'
    | 'flatlay_folded'
    | 'surface_draped'
    | 'surface_hanging'
    | 'detail_print'
    | 'detail_fabric'
    | 'detail_collar'
  >('flatlay_topdown')
  const [isHydrating, setIsHydrating] = useState(false)
  const [hydrateFailed, setHydrateFailed] = useState<string | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const retentionDays = limits.assetHistoryRetentionDays

  const getExpiryLabel = (timestamp: number) => {
    if (retentionDays < 0) return 'No expiry'
    const expiresAtMs = timestamp + retentionDays * 24 * 60 * 60 * 1000
    const remainingMs = expiresAtMs - Date.now()
    if (remainingMs <= 0) return 'Expired'
    const daysLeft = Math.ceil(remainingMs / (24 * 60 * 60 * 1000))
    return daysLeft <= 1 ? 'Expires in 1 day' : `Expires in ${daysLeft} days`
  }

  const formatViewTitle = (t: string) => {
    switch (t) {
      case 'flat-lay':
      case 'flatlay_topdown':
        return 'Top-down flat lay'
      case 'flatlay_45deg':
        return '45° angled flat lay'
      case 'flatlay_sleeves':
        return 'Sleeve spread'
      case 'flatlay_relaxed':
        return 'Relaxed flat lay'
      case 'flatlay_folded':
        return 'Folded logo'
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

  useEffect(() => {
    let cancelled = false
    setIsHydrating(true)
    setHydrateFailed(null)

    fetchProject(projectId)
      .then((p) => {
        if (cancelled) return
        if (!p) setHydrateFailed('Project not found')
      })
      .catch((e) => {
        if (cancelled) return
        setHydrateFailed(e instanceof Error ? e.message : 'Failed to load project')
      })
      .finally(() => {
        if (cancelled) return
        setIsHydrating(false)
      })

    return () => {
      cancelled = true
    }
  }, [fetchProject, projectId])

  useEffect(() => {
    if (!project || project.generation?.status !== 'generating') return
    let stopped = false

    const tick = async () => {
      try {
        await fetchProject(projectId)
      } catch {
        // Polling errors are non-fatal; the next tick retries.
      }
    }

    void tick()
    const interval = window.setInterval(() => {
      if (stopped) return
      void tick()
    }, 2500)

    return () => {
      stopped = true
      window.clearInterval(interval)
    }
  }, [fetchProject, project, projectId])

  if (!project) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">
          {isHydrating ? 'Loading project…' : hydrateFailed ?? 'Project not found'}
        </p>
        <Link href="/dashboard/library">
          <Button className="mt-4">Back to Library</Button>
        </Link>
      </div>
    )
  }

  const isActivelyGenerating =
    project.generation?.status === 'generating' &&
    typeof project.generation.total === 'number' &&
    typeof project.generation.completed === 'number' &&
    project.generation.completed < project.generation.total
  const canGenerateMoreFeature = limits.generateMore
  const canGenerateMore = !isActivelyGenerating && canGenerateMoreFeature
  const navigableImages = project.generatedImages.filter((img) => !!img.url)
  const activeLightboxImage = lightboxIndex == null ? null : navigableImages[lightboxIndex] ?? null

  const startRename = () => {
    setNameDraft(project.name)
    setIsRenaming(true)
  }

  const cancelRename = () => {
    setIsRenaming(false)
    setNameDraft('')
  }

  const saveRename = async () => {
    const next = nameDraft.trim()
    if (!next) return
    if (next !== project.name) {
      try {
        await updateProject(projectId, { name: next })
        setIsRenaming(false)
      } catch (e) {
        toast({
          title: 'Rename failed',
          description: e instanceof Error ? e.message : 'Please try again.',
          variant: 'destructive',
        })
      }
      return
    }
    setIsRenaming(false)
  }

  const generationLabel = project.generation
    ? project.generation.status === 'generating'
      ? `Generating ${project.generation.completed}/${project.generation.total}${
          project.generation.nextType ? ` • Next: ${project.generation.nextType}` : ''
        }`
      : project.generation.status === 'complete'
        ? ''
        : project.generation.status === 'error'
          ? `Error • ${project.generation.completed}/${project.generation.total}`
          : ''
    : ''

  const downloadAll = async () => {
    if (isDownloading) return
    setIsDownloading(true)
    try {
      // Trigger a file download (server streams ZIP).
      window.location.href = `/api/projects/${projectId}/download`
    } finally {
      // We can't reliably know when the download completes; re-enable quickly.
      window.setTimeout(() => setIsDownloading(false), 1200)
    }
  }

  useEffect(() => {
    if (lightboxIndex == null) return
    const onKey = (e: KeyboardEvent) => {
      if (!navigableImages.length) return
      if (e.key === 'ArrowRight') {
        setLightboxIndex((prev) => (prev == null ? 0 : (prev + 1) % navigableImages.length))
      } else if (e.key === 'ArrowLeft') {
        setLightboxIndex((prev) =>
          prev == null ? 0 : (prev - 1 + navigableImages.length) % navigableImages.length
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, navigableImages.length])

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href="/dashboard/library">
            <Button variant="outline" className="mb-3">← Back</Button>
          </Link>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {isRenaming ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    className="h-10 text-base sm:text-lg font-semibold"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveRename()
                      if (e.key === 'Escape') cancelRename()
                    }}
                    aria-label="Project name"
                  />
                  <Button
                    size="icon"
                    className="shrink-0"
                    onClick={() => void saveRename()}
                    aria-label="Save name"
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="shrink-0"
                    onClick={cancelRename}
                    aria-label="Cancel rename"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-bold leading-tight truncate">{project.name}</h1>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0"
                    onClick={startRename}
                    aria-label="Rename project"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date(project.createdAt).toLocaleDateString()}
            <span className="mx-2">•</span>
            {project.generatedImages.length} generated
            {project.generation?.status === 'generating'
              ? ` (${project.generation.completed}/${project.generation.total})`
              : project.generation?.status === 'complete'
                ? ` (${project.generation.total}/${project.generation.total})`
                : ''}
          </p>
          {generationLabel ? (
            <p className="text-sm text-muted-foreground mt-2">{generationLabel}</p>
          ) : null}
          {project.generation?.status === 'error' && project.generation.errorMessage ? (
            <p className="text-sm text-destructive mt-2">{project.generation.errorMessage}</p>
          ) : null}
        </div>

        <div className="flex gap-3 shrink-0">
          <Button onClick={downloadAll} disabled={isDownloading}>
            {isDownloading ? 'Preparing…' : 'Download All'}
          </Button>
          <Button variant="outline" onClick={() => setShareDialogOpen(true)}>
            Share
          </Button>
          <ShareDialog
            projectId={projectId}
            open={shareDialogOpen}
            onOpenChange={setShareDialogOpen}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr] lg:items-start">
        {/* Left: sticky sidebar */}
        <aside className="lg:sticky lg:top-6 space-y-6">
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="p-4 border-b border-border">
              <h2 className="text-base font-semibold">Original</h2>
              <p className="text-xs text-muted-foreground mt-1">
                This is the reference image used for all outputs.
              </p>
            </div>
            <div className="p-4">
              <div className="rounded-lg overflow-hidden border border-border">
                <img
                  src={project.originalImage}
                  alt="Original design"
                  className="w-full aspect-square object-cover"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="p-4 border-b border-border">
              <h3 className="text-base font-semibold">Generate more</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Add additional views while keeping the same original.
              </p>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Select
                  value={moreType}
                  onValueChange={(v) =>
                    setMoreType(
                      v as
                        | 'flatlay_topdown'
                        | 'flatlay_45deg'
                        | 'flatlay_sleeves'
                        | 'flatlay_relaxed'
                        | 'flatlay_folded'
                        | 'surface_draped'
                        | 'surface_hanging'
                        | 'detail_print'
                        | 'detail_fabric'
                        | 'detail_collar'
                    )
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flatlay_topdown">Top-down flat lay</SelectItem>
                    <SelectItem value="flatlay_45deg">45° angled flat lay</SelectItem>
                    <SelectItem value="flatlay_sleeves">Sleeve spread</SelectItem>
                    <SelectItem value="flatlay_relaxed">Relaxed flat lay</SelectItem>
                    <SelectItem value="flatlay_folded">Folded logo</SelectItem>
                    <SelectItem value="surface_draped">Draped over surface</SelectItem>
                    <SelectItem value="surface_hanging">Hanging shot</SelectItem>
                    <SelectItem value="detail_print">Print close-up</SelectItem>
                    <SelectItem value="detail_fabric">Fabric macro</SelectItem>
                    <SelectItem value="detail_collar">Collar detail</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  className="flex-1"
                  disabled={!canGenerateMore}
                  onClick={async () => {
                    const preset = project.generation?.preset ?? 'raw'
                    try {
                      const res = await fetch(`/api/projects/${projectId}/generate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mode: 'more', shotTypes: [moreType], preset }),
                      })
                      const data = (await res.json().catch(() => ({}))) as { error?: string }
                      if (!res.ok) throw new Error(data.error || 'Failed to enqueue generation')
                      await fetchProject(projectId)
                    } catch (e) {
                      toast({
                        title: 'Generation failed',
                        description: e instanceof Error ? e.message : 'Please try again.',
                        variant: 'destructive',
                      })
                    }
                  }}
                >
                  {isActivelyGenerating ? 'Generating…' : 'Generate more'}
                </Button>
              </div>
              {!canGenerateMoreFeature ? (
                <p className="text-xs text-muted-foreground">
                  Generate more is not available on your current plan.
                </p>
              ) : null}

              <div className="text-xs text-muted-foreground">
                Tip: you can generate dozens of assets; the gallery will keep expanding below.
              </div>
            </div>
          </div>
        </aside>

        {/* Right: responsive gallery */}
        <section className="min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Generated Content</h2>
            <p className="text-xs text-muted-foreground">
              {project.generation?.status === 'generating'
                ? 'Updating live…'
                : project.generatedImages.length
                  ? 'Ready'
                  : 'No outputs yet'}
            </p>
          </div>

          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {project.generatedImages.map((img) => (
              <div
                key={img.id}
                className="rounded-xl overflow-hidden border border-border bg-card hover:border-accent transition-colors"
              >
                {img.url ? (
                  <button
                    type="button"
                    className="block w-full text-left"
                    onClick={() => {
                      const idx = navigableImages.findIndex((x) => x.id === img.id)
                      if (idx >= 0) setLightboxIndex(idx)
                    }}
                    aria-label={`Open ${formatViewTitle(img.type)}`}
                  >
                    <img
                      src={img.url}
                      alt={img.type}
                      className="w-full aspect-square object-cover"
                      loading="lazy"
                    />
                  </button>
                ) : (
                  <LightboxAsset title={formatViewTitle(img.type)} prompt={img.prompt}>
                    <div className="w-full aspect-square flex items-center justify-center bg-secondary/50">
                      <p className="text-sm font-medium text-muted-foreground">
                        {formatViewTitle(img.type)}
                      </p>
                    </div>
                  </LightboxAsset>
                )}
                <div className="px-3 py-2 border-t border-border">
                  <p className="text-xs text-muted-foreground text-center">
                    {formatViewTitle(img.type)}
                  </p>
                  {typeof img.timestamp === 'number' ? (
                    <p className="text-[11px] text-muted-foreground/80 text-center mt-1">
                      {getExpiryLabel(img.timestamp)}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}

            {project.generation?.status === 'generating'
              ? Array.from(
                  { length: Math.max(0, project.generation.total - project.generatedImages.length) },
                  (_, i) => {
                    const isNext = i === 0
                    const label = isNext
                      ? project.generation?.nextType
                        ? formatViewTitle(project.generation.nextType)
                        : 'Generating'
                      : 'Pending'
                    return (
                      <div
                        key={`placeholder-${i}`}
                        className="rounded-xl overflow-hidden border border-border bg-card"
                      >
                        <div className="w-full aspect-square flex items-center justify-center bg-secondary/50">
                          <p className="text-sm font-medium text-muted-foreground">
                            {label}
                          </p>
                        </div>
                        <div className="px-3 py-2 border-t border-border">
                          <p className="text-xs text-muted-foreground text-center">
                            {isNext ? 'Generating…' : 'Pending'}
                          </p>
                        </div>
                      </div>
                    )
                  }
                )
              : null}
          </div>
        </section>
      </div>

      <Dialog open={lightboxIndex != null} onOpenChange={(open) => !open && setLightboxIndex(null)}>
        <DialogContent className="[&>button]:right-3 [&>button]:top-3 [&>button]:z-50 [&>button]:rounded-md [&>button]:bg-background/90 [&>button]:p-1 [&>button]:text-red-500 [&>button:hover]:text-red-400 max-w-[min(1100px,calc(100vw-2rem))] p-0 overflow-hidden">
          <DialogTitle className="sr-only">
            {activeLightboxImage ? formatViewTitle(activeLightboxImage.type) : 'Image preview'}
          </DialogTitle>
          {activeLightboxImage ? (
            <div className="relative bg-black/40">
              <img
                src={activeLightboxImage.url}
                alt={activeLightboxImage.type}
                className="block w-full h-auto max-h-[80vh] object-contain"
              />
              {navigableImages.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxIndex((prev) =>
                        prev == null ? 0 : (prev - 1 + navigableImages.length) % navigableImages.length
                      )
                    }
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-border bg-background/85 p-2"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxIndex((prev) =>
                        prev == null ? 0 : (prev + 1) % navigableImages.length
                      )
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-border bg-background/85 p-2"
                    aria-label="Next image"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
          {activeLightboxImage ? (
            <div className="px-4 py-3 border-t border-border text-sm text-muted-foreground flex items-center justify-between">
              <span>{formatViewTitle(activeLightboxImage.type)}</span>
              <span className="text-xs">
                {lightboxIndex != null ? `${lightboxIndex + 1}/${navigableImages.length}` : ''}
              </span>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

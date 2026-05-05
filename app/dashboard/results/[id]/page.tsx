'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useProjects } from '@/hooks/use-projects'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Check, ChevronLeft, ChevronRight, Pencil, Trash2, X } from 'lucide-react'
import { ShareDialog } from '@/components/share-dialog'
import { toast } from '@/hooks/use-toast'
import { Textarea } from '@/components/ui/textarea'
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
  const [selectedDownloadIds, setSelectedDownloadIds] = useState<string[]>([])
  const [isSelectingDownloads, setIsSelectingDownloads] = useState(false)
  const [downloadFormat, setDownloadFormat] = useState<'original' | 'png' | 'jpeg' | 'webp'>('original')
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
  const [queueNudgeStatus, setQueueNudgeStatus] = useState<'idle' | 'ok' | 'retrying'>('idle')
  const [isRenaming, setIsRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null)
  const [isEditingAsset, setIsEditingAsset] = useState(false)
  const [editDraft, setEditDraft] = useState('')
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false)
  const [pendingEditedFromId, setPendingEditedFromId] = useState<string | null>(null)
  const [originalImageSrc, setOriginalImageSrc] = useState<string>('')
  const [originalImageFailed, setOriginalImageFailed] = useState(false)
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
      case 'background_remove':
        return 'Background removed'
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

  const generationStatus = project?.generation?.status
  const generationPipeline = project?.generation?.pipeline
  const generationAspectRatio = project?.generation?.aspectRatio ?? '1:1'
  /** All generated assets in gallery order (includes placeholder rows with empty `url` when API key is missing). */
  const lightboxImages = project?.generatedImages ?? []
  const activeLightboxImage = lightboxIndex == null ? null : lightboxImages[lightboxIndex] ?? null
  const generationTypeLabel =
    project?.generation?.renderStyleLevel === 'photoreal_flatlay'
      ? 'Mockups to ProtoReal'
      : generationPipeline === 'design_realize'
        ? 'Sketch-to-3D Mockups'
        : generationPipeline === 'background_remove'
          ? 'Background remover'
          : 'Product Shots'

  useEffect(() => {
    const hasOutstandingJobs =
      typeof project?.generation?.total === 'number' &&
      typeof project?.generation?.completed === 'number' &&
      project.generation.completed < project.generation.total
    const shouldNudgeQueue = generationStatus === 'generating' || (generationStatus === 'error' && hasOutstandingJobs)
    if (!shouldNudgeQueue) return
    if (generationPipeline === 'background_remove') return
    let stopped = false

    const tick = async () => {
      try {
        // Nudge the queue on each poll so long-running generations resume after navigation.
        try {
          const dispatchRes = await fetch('/api/jobs/dispatch', { method: 'POST' })
          setQueueNudgeStatus(dispatchRes.ok ? 'ok' : 'retrying')
        } catch {
          setQueueNudgeStatus('retrying')
        }
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
      setQueueNudgeStatus('idle')
    }
  }, [fetchProject, generationPipeline, generationStatus, project?.generation?.completed, project?.generation?.total, projectId])

  useEffect(() => {
    if (lightboxIndex == null) return
    const onKey = (e: KeyboardEvent) => {
      if (isEditingAsset) return
      if (!lightboxImages.length) return
      if (e.key === 'ArrowRight') {
        setLightboxIndex((prev) => (prev == null ? 0 : (prev + 1) % lightboxImages.length))
      } else if (e.key === 'ArrowLeft') {
        setLightboxIndex((prev) =>
          prev == null ? 0 : (prev - 1 + lightboxImages.length) % lightboxImages.length
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, lightboxImages.length, isEditingAsset])

  useEffect(() => {
    if (!pendingEditedFromId) return

    const candidates = (project?.generatedImages ?? []).filter(
      (img) => img.editedFromId === pendingEditedFromId && !!img.url
    )
    if (!candidates.length) return

    const newest = candidates.reduce((a, b) => (a.timestamp >= b.timestamp ? a : b))
    const imgs = project?.generatedImages ?? []
    const idx = imgs.findIndex((img) => img.id === newest.id)
    if (idx < 0) return

    setLightboxIndex(idx)
    setPendingEditedFromId(null)
    setIsEditingAsset(false)
  }, [pendingEditedFromId, project?.generatedImages])

  useEffect(() => {
    if (!project) return
    setOriginalImageSrc(project.originalImage)
    setOriginalImageFailed(false)
  }, [project?.id, project?.originalImage])

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
  const isDesignRealizePipeline = project.generation?.pipeline === 'design_realize'
  const canImageEditing = role === 'studio' || role === 'label' || role === 'admin'
  const generationReferenceImages = (() => {
    const multi = Array.isArray(project.generation?.sourceImageUrls)
      ? project.generation.sourceImageUrls.filter((url) => typeof url === 'string' && url.trim().length > 0)
      : []
    if (multi.length > 0) return multi
    const single = project.generation?.sourceImageUrl
    if (single && single.trim().length > 0) return [single]
    return [project.originalImage]
  })()

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

  const deleteAsset = async (assetId: string) => {
    if (deletingAssetId) return
    const target = project.generatedImages.find((img) => img.id === assetId)
    if (!target) return

    const confirmed = window.confirm(
      `Delete "${formatViewTitle(target.type)}" from this project? This cannot be undone.`
    )
    if (!confirmed) return

    setDeletingAssetId(assetId)
    try {
      const nextImages = project.generatedImages.filter((img) => img.id !== assetId)
      await updateProject(projectId, { generatedImages: nextImages })

      if (lightboxIndex != null) {
        if (nextImages.length === 0) {
          setLightboxIndex(null)
        } else {
          setLightboxIndex((prev) => {
            if (prev == null) return null
            return Math.min(prev, nextImages.length - 1)
          })
        }
      }

      toast({
        title: 'Asset deleted',
        description: 'The asset has been removed from this project.',
      })
    } catch (e) {
      toast({
        title: 'Delete failed',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setDeletingAssetId(null)
    }
  }

  const startEdit = (assetId?: string) => {
    if (!canImageEditing) {
      toast({
        title: 'Image editing requires Studio',
        description: 'Upgrade to Studio (or above) to apply edit instructions.',
        variant: 'destructive',
      })
      return
    }
    if (isEditingAsset) return
    const targetAsset = assetId
      ? project.generatedImages.find((img) => img.id === assetId) ?? null
      : activeLightboxImage
    if (!targetAsset) return
    if (!targetAsset.url) {
      toast({
        title: 'Nothing to edit yet',
        description: 'This slot has no image (for example, no Replicate token). Configure REPLICATE_API_TOKEN to generate pixels.',
        variant: 'destructive',
      })
      return
    }

    if (assetId) {
      const idx = project.generatedImages.findIndex((img) => img.id === assetId)
      if (idx < 0) return
      setLightboxIndex(idx)
    }

    setPendingEditedFromId(null)
    setEditDraft(targetAsset.editRequest ?? '')
    setIsEditingAsset(true)
  }

  const cancelEdit = () => {
    setIsEditingAsset(false)
    setEditDraft('')
  }

  const submitEdit = async () => {
    if (!canImageEditing) {
      toast({
        title: 'Image editing requires Studio',
        description: 'Upgrade to Studio (or above) to apply edit instructions.',
        variant: 'destructive',
      })
      return
    }
    if (!activeLightboxImage) return
    if (isSubmittingEdit) return
    const next = editDraft.trim()
    if (!next) return

    setIsSubmittingEdit(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/assets/${activeLightboxImage.id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: next }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit edit')
      }

      setPendingEditedFromId(activeLightboxImage.id)
      setIsEditingAsset(false)
      setEditDraft('')

      // Ensure the "Generating..." placeholders render right away.
      await fetchProject(projectId)

      toast({
        title: 'Edit submitted',
        description: 'Generating an updated version…',
      })
    } catch (e) {
      toast({
        title: 'Edit failed',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmittingEdit(false)
    }
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

  const toggleDownloadSelection = (assetId: string) => {
    setSelectedDownloadIds((prev) =>
      prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]
    )
  }

  const startDownloadAll = async () => {
    if (isDownloading) return
    setIsDownloading(true)
    try {
      toast({
        title: 'Download started',
        description: 'Preparing your ZIP file…',
      })
      window.location.href = `/api/projects/${projectId}/download?format=${downloadFormat}`
    } finally {
      window.setTimeout(() => setIsDownloading(false), 1200)
    }
  }

  const downloadSelected = async () => {
    if (isDownloading) return
    if (selectedDownloadIds.length === 0) {
      toast({
        title: 'No images selected',
        description: 'Select at least one generated image to download.',
        variant: 'destructive',
      })
      return
    }
    setIsDownloading(true)
    try {
      const assetIdsQuery = `?assetIds=${encodeURIComponent(selectedDownloadIds.join(','))}&format=${downloadFormat}`
      toast({
        title: 'Download started',
        description: `Preparing ZIP for ${selectedDownloadIds.length} selected image${selectedDownloadIds.length === 1 ? '' : 's'}…`,
      })
      window.location.href = `/api/projects/${projectId}/download${assetIdsQuery}`
      setIsSelectingDownloads(false)
      setSelectedDownloadIds([])
    } finally {
      window.setTimeout(() => setIsDownloading(false), 1200)
    }
  }

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
          {generationTypeLabel ? (
            <p className="text-sm text-muted-foreground mt-1">
              Generation type: <span className="text-foreground">{generationTypeLabel}</span>
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground mt-1">
            Aspect ratio: <span className="text-foreground">{generationAspectRatio}</span>
          </p>
          {generationLabel ? (
            <p className="text-sm text-muted-foreground mt-2">{generationLabel}</p>
          ) : null}
          {project.generation?.status === 'error' && project.generation.errorMessage ? (
            <p className="text-sm text-destructive mt-2">{project.generation.errorMessage}</p>
          ) : null}
        </div>

        <div className="flex gap-3 shrink-0">
          <Button
            onClick={() => {
              setIsSelectingDownloads(true)
              setSelectedDownloadIds([])
            }}
            disabled={isDownloading}
          >
            {isDownloading ? 'Preparing…' : 'Download'}
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
                This is the primary reference image used for outputs.
              </p>
            </div>
            <div className="p-4">
              <div className="rounded-lg overflow-hidden border border-border">
                {originalImageFailed ? (
                  <div className="w-full aspect-square flex items-center justify-center bg-secondary/40 px-4 text-center">
                    <p className="text-xs text-muted-foreground">
                      Original image format is not previewable in this browser.
                      {project.generation?.sourceImageUrl ? ' Generation will still use your uploaded file.' : ''}
                    </p>
                  </div>
                ) : (
                  <img
                    src={originalImageSrc || project.originalImage}
                    alt="Original design"
                    className="w-full aspect-square object-cover"
                    onError={() => {
                      const fallback = project.generation?.sourceImageUrl
                      if (fallback && originalImageSrc !== fallback) {
                        setOriginalImageSrc(fallback)
                        return
                      }
                      setOriginalImageFailed(true)
                    }}
                  />
                )}
              </div>
              {generationReferenceImages.length > 1 ? (
                <div className="mt-4">
                  <p className="text-xs font-medium text-foreground">References used</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {generationReferenceImages.map((refUrl, idx) => (
                      <div key={`${refUrl}-${idx}`} className="rounded-md overflow-hidden border border-border bg-secondary/40">
                        <img
                          src={refUrl}
                          alt={`Reference ${idx + 1}`}
                          className="w-full aspect-square object-cover"
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="p-4 border-b border-border">
              <h3 className="text-base font-semibold">
                {isDesignRealizePipeline ? 'Another image' : 'Generate more'}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {isDesignRealizePipeline
                  ? 'Same sketch or mockup — another photoreal version on a white studio background (1 credit).'
                  : 'Add additional views while keeping the same original.'}
              </p>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {isDesignRealizePipeline ? (
                <Button
                  className="w-full"
                  disabled={!canGenerateMore}
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/projects/${projectId}/generate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          mode: 'more',
                          shotTypes: ['flatlay_topdown'],
                          preset: 'studio',
                          pipeline: 'design_realize',
                          ...(project.generation?.aspectRatio
                            ? { aspectRatio: project.generation.aspectRatio }
                            : {}),
                        }),
                      })
                      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
                      if (!res.ok) {
                        if (data.code === 'email_not_verified') {
                          toast({
                            title: 'Email not verified',
                            description: 'Please verify your email before generating content. Check your inbox or use the banner above to resend.',
                            variant: 'destructive',
                          })
                          return
                        }
                        throw new Error(data.error || 'Failed to enqueue generation')
                      }
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
                  {isActivelyGenerating ? 'Generating…' : 'Generate another (1 credit)'}
                </Button>
              ) : (
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
                      <SelectItem value="flatlay_45deg">Diagonal overhead flat lay</SelectItem>
                      <SelectItem value="flatlay_sleeves">Sleeve spread</SelectItem>
                      <SelectItem value="flatlay_relaxed">Relaxed flat lay</SelectItem>
                      <SelectItem value="flatlay_folded">Folded retail shot</SelectItem>
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
                          body: JSON.stringify({
                            mode: 'more',
                            shotTypes: [moreType],
                            preset,
                          ...(project.generation?.aspectRatio
                            ? { aspectRatio: project.generation.aspectRatio }
                            : {}),
                            ...(project.generation?.pipeline
                              ? { pipeline: project.generation.pipeline }
                              : {}),
                          }),
                        })
                        const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
                        if (!res.ok) {
                          if (data.code === 'email_not_verified') {
                            toast({
                              title: 'Email not verified',
                              description: 'Please verify your email before generating content. Check your inbox or use the banner above to resend.',
                              variant: 'destructive',
                            })
                            return
                          }
                          throw new Error(data.error || 'Failed to enqueue generation')
                        }
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
              )}
              {!canGenerateMoreFeature ? (
                <p className="text-xs text-muted-foreground">
                  Generate more is not available on your current plan.
                </p>
              ) : null}

              {!isDesignRealizePipeline ? (
                <div className="text-xs text-muted-foreground">
                  Tip: you can generate dozens of assets; the gallery will keep expanding below.
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        {/* Right: responsive gallery */}
        <section className="min-w-0">
          {isSelectingDownloads ? (
            <div className="mb-3 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Select assets to download: {selectedDownloadIds.length} selected
              </p>
              <div className="flex items-center gap-2">
                <Select value={downloadFormat} onValueChange={(v) => setDownloadFormat(v as typeof downloadFormat)}>
                  <SelectTrigger className="h-8 w-[140px]">
                    <SelectValue placeholder="Format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="original">Original</SelectItem>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="jpeg">JPEG</SelectItem>
                    <SelectItem value="webp">WEBP</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void startDownloadAll()}
                  disabled={isDownloading}
                >
                  Download all
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsSelectingDownloads(false)
                    setSelectedDownloadIds([])
                  }}
                  disabled={isDownloading}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void downloadSelected()} disabled={isDownloading}>
                  {isDownloading ? 'Preparing…' : 'Download selected'}
                </Button>
              </div>
            </div>
          ) : null}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Generated Content</h2>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                {project.generation?.status === 'generating'
                  ? 'Updating live…'
                  : project.generatedImages.length
                    ? 'Ready'
                    : 'No outputs yet'}
              </p>
              {project.generation?.status === 'generating' ? (
                <p className="text-[11px] text-muted-foreground/80 mt-1">
                  {queueNudgeStatus === 'retrying'
                    ? 'Reconnecting generation queue...'
                    : 'Generation queue connected'}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {project.generatedImages.map((img) => (
              <div
                key={img.id}
                className={`rounded-xl overflow-hidden border bg-card transition-all ${
                  isSelectingDownloads && selectedDownloadIds.includes(img.id)
                    ? 'border-accent ring-1 ring-accent/70 shadow-[0_0_18px_rgba(239,68,68,0.35)]'
                    : 'border-border'
                }`}
              >
                <button
                  type="button"
                  className="block w-full text-left"
                  onClick={() => {
                    if (isSelectingDownloads) {
                      if (!img.url) return
                      toggleDownloadSelection(img.id)
                      return
                    }
                    const idx = project.generatedImages.findIndex((x) => x.id === img.id)
                    if (idx >= 0) setLightboxIndex(idx)
                  }}
                  aria-label={
                    img.url ? `Open ${formatViewTitle(img.type)}` : `Open ${formatViewTitle(img.type)} — prompt preview`
                  }
                >
                  {img.url ? (
                    <img
                      src={img.url}
                      alt={img.type}
                      className="w-full aspect-square object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full aspect-square flex flex-col items-center justify-center gap-2 bg-secondary/50 px-3">
                      <p className="text-sm font-medium text-muted-foreground text-center">
                        {formatViewTitle(img.type)}
                      </p>
                      <p className="text-[10px] text-muted-foreground/90 text-center leading-snug">
                        No image · open for full prompt
                      </p>
                    </div>
                  )}
                </button>
                <div className="px-3 py-2 border-t border-border">
                  <p className="text-xs text-muted-foreground text-center">
                    {formatViewTitle(img.type)}
                  </p>
                  {typeof img.timestamp === 'number' ? (
                    <p className="text-[11px] text-muted-foreground/80 text-center mt-1">
                      {getExpiryLabel(img.timestamp)}
                    </p>
                  ) : null}
                  {img.url && canImageEditing ? (
                    <div className="mt-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 w-full text-xs"
                        disabled={deletingAssetId != null || isSubmittingEdit}
                        onClick={() => startEdit(img.id)}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1" />
                        Edit
                      </Button>
                    </div>
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
        <DialogContent className="[&>button]:right-3 [&>button]:top-3 [&>button]:z-50 [&>button]:rounded-md [&>button]:bg-background/90 [&>button]:p-1 [&>button]:text-red-500 [&>button:hover]:text-red-400 flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[min(1100px,calc(100vw-1rem))] flex-col overflow-hidden p-0 sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:max-w-[min(1100px,calc(100vw-2rem))]">
          <DialogTitle className="sr-only">
            {activeLightboxImage ? formatViewTitle(activeLightboxImage.type) : 'Image preview'}
          </DialogTitle>
          {activeLightboxImage ? (
            <div className="relative min-h-0 flex-1 bg-[#0a0a0a]/40">
              {activeLightboxImage.url ? (
                <img
                  src={activeLightboxImage.url}
                  alt={activeLightboxImage.type}
                  className="block w-full h-auto max-h-[calc(100dvh-8rem)] object-contain sm:max-h-[80vh]"
                />
              ) : (
                <div className="bg-background text-foreground">
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-sm font-medium">No image output</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      The image API key is not set, or the model returned no pixels. This is the full generation prompt
                      that was used (same as with a live key).
                    </p>
                  </div>
                  <div className="max-h-[min(70vh,720px)] overflow-y-auto p-4">
                    {activeLightboxImage.prompt ? (
                      <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-secondary/30 p-3 text-xs leading-relaxed">
                        {activeLightboxImage.prompt}
                      </pre>
                    ) : (
                      <p className="text-sm text-muted-foreground">No prompt was stored for this asset.</p>
                    )}
                  </div>
                </div>
              )}
              {!isEditingAsset && project.generatedImages.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxIndex((prev) =>
                        prev == null
                          ? 0
                          : (prev - 1 + project.generatedImages.length) % project.generatedImages.length
                      )
                    }
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-border bg-background/85 p-2 z-30"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxIndex((prev) =>
                        prev == null ? 0 : (prev + 1) % project.generatedImages.length
                      )
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-border bg-background/85 p-2 z-30"
                    aria-label="Next image"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              ) : null}

            </div>
          ) : null}
          {activeLightboxImage ? (
            <>
              {activeLightboxImage.editRequest && !isEditingAsset && activeLightboxImage.url ? (
                <div className="px-4 py-3 border-t border-border bg-background/60">
                  <details>
                    <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Edit text used
                    </summary>
                    <div className="mt-2 text-xs text-muted-foreground/80">
                      Edited by {activeLightboxImage.editedByBrandName ?? 'Editor'}
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap break-words max-h-[22vh] overflow-auto rounded-md bg-secondary/30 p-2 text-xs leading-relaxed">
                      {activeLightboxImage.editRequest}
                    </pre>
                  </details>
                </div>
              ) : null}

              {isEditingAsset ? (
                <div className="px-4 py-3 border-t border-border bg-background/60">
                  <div className="text-sm font-medium">Edit instructions</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Only safe refinements will be applied; prints/logos/silhouette are preserved.
                  </div>
                  <Textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    className="mt-3"
                    rows={4}
                    placeholder="e.g. Reduce dust and improve lighting; keep the print placement unchanged."
                    disabled={isSubmittingEdit}
                    aria-label="Edit instructions"
                  />
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={isSubmittingEdit || !editDraft.trim()}
                      onClick={() => void submitEdit()}
                    >
                      {isSubmittingEdit ? 'Applying…' : 'Apply'}
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={isSubmittingEdit} onClick={cancelEdit}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="px-4 py-3 border-t border-border text-sm text-muted-foreground flex items-center justify-between">
                <span>{formatViewTitle(activeLightboxImage.type)}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs">
                    {lightboxIndex != null ? `${lightboxIndex + 1}/${project.generatedImages.length}` : ''}
                  </span>
                  {!isEditingAsset ? (
                    <>
                      {canImageEditing && activeLightboxImage.url ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={deletingAssetId != null || isSubmittingEdit}
                          onClick={() => startEdit()}
                        >
                          <Pencil className="w-3.5 h-3.5 mr-1" />
                          Edit
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs text-destructive hover:text-white"
                        disabled={deletingAssetId != null || isSubmittingEdit}
                        onClick={() => void deleteAsset(activeLightboxImage.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        {deletingAssetId === activeLightboxImage.id ? 'Deleting…' : 'Delete'}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

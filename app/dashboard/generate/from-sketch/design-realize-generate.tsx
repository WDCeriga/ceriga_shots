'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useProjects } from '@/hooks/use-projects'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { useRole } from '@/hooks/use-role'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { RenderStyleLevel } from '@/types/projects'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/** Internal job type for queue + meta; prompt is white-backdrop design_realize in mockups. */
const DESIGN_JOB_SHOT = 'flatlay_topdown' as const
const DESIGN_JOB_PRESET = 'studio' as const

const FROM_SKETCH_PATH = '/dashboard/generate/from-sketch'
const PROTOREAL_PATH = '/dashboard/generate/protoreal'

export type DesignRealizeMode = 'sketch3d' | 'protoreal'

export function DesignRealizeGeneratePage({ mode = 'sketch3d' }: { mode?: DesignRealizeMode }) {
  const isProtoRealMode = mode === 'protoreal'
  const callbackPath = isProtoRealMode ? PROTOREAL_PATH : FROM_SKETCH_PATH
  const pageTitle = isProtoRealMode ? 'Mockups to ProtoReal' : 'Sketch-to-3D Mockups'
  const pageDescription = isProtoRealMode
    ? 'Upload an existing mockup and convert it into a photoreal top-down product-shot style flatlay while preserving design fidelity.'
    : 'Upload a drawing or mockup. You get one stylized 3D render of the item on a simple studio background — same idea as your upload, ready for listings or decks.'
  const sketchLabel = isProtoRealMode ? 'Mockup image' : 'Sketch or mockup'
  const fixedRenderStyle: RenderStyleLevel | undefined = isProtoRealMode ? 'photoreal_flatlay' : undefined

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string>('')
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [productType, setProductType] = useState<'auto' | 'hoodie' | 'tshirt' | 'jacket' | 'sweatshirt' | 'pants' | 'custom'>(
    'auto'
  )
  const [customProductType, setCustomProductType] = useState('')
  const [designRealizeRefinements, setDesignRealizeRefinements] = useState('')
  const [materialHint, setMaterialHint] = useState('')
  const [renderStyleLevel, setRenderStyleLevel] = useState<RenderStyleLevel>(fixedRenderStyle ?? 'clean_cgi')
  const { addProject, deleteProject, updateProject } = useProjects()
  const router = useRouter()
  const { status } = useSession()
  const { limits } = useRole()
  const isAuthed = status === 'authenticated'
  const isAuthLoading = status === 'loading'
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null)
  const [creditsLimit, setCreditsLimit] = useState<number | null>(null)
  const [creditsSyncing, setCreditsSyncing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const designFlowAllowed = useMemo(() => {
    if (limits.blockedShotTypes.includes(DESIGN_JOB_SHOT)) return false
    if (!limits.presets.includes(DESIGN_JOB_PRESET)) return false
    return true
  }, [limits.blockedShotTypes, limits.presets])

  useEffect(() => {
    if (!isAuthed) {
      setCreditsRemaining(null)
      setCreditsLimit(null)
      setCreditsSyncing(false)
      return
    }

    if (limits.credits < 0) {
      setCreditsLimit(-1)
      setCreditsRemaining(Number.MAX_SAFE_INTEGER)
    } else {
      setCreditsLimit(limits.credits)
      setCreditsRemaining(limits.credits)
    }
    try {
      const cachedRaw = window.localStorage.getItem('credits-cache')
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as { remaining?: number; limit?: number; ts?: number }
        if (typeof cached.ts === 'number' && Date.now() - cached.ts < 60_000 && typeof cached.remaining === 'number') {
          setCreditsRemaining(cached.remaining)
          if (typeof cached.limit === 'number') setCreditsLimit(cached.limit)
        }
      }
    } catch {}

    let cancelled = false
    setCreditsSyncing(true)
    fetch('/api/me')
      .then(async (res) => {
        if (!res.ok) return null
        return (await res.json()) as { user?: { credits?: { remaining?: number; limit?: number } | null } }
      })
      .then((data) => {
        if (cancelled) return
        const remaining = data?.user?.credits?.remaining
        const limit = data?.user?.credits?.limit
        setCreditsRemaining(typeof remaining === 'number' ? remaining : null)
        setCreditsLimit(typeof limit === 'number' ? limit : null)
        if (typeof remaining === 'number' && typeof limit === 'number') {
          try {
            window.localStorage.setItem('credits-cache', JSON.stringify({ remaining, limit, ts: Date.now() }))
          } catch {}
        }
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return
        setCreditsSyncing(false)
      })

    return () => {
      cancelled = true
    }
  }, [isAuthed, limits.credits])

  useEffect(() => {
    if (fixedRenderStyle) setRenderStyleLevel(fixedRenderStyle)
  }, [fixedRenderStyle])

  const creditsNeeded = 1
  const hasEnoughCredits =
    creditsRemaining == null || creditsRemaining === Number.MAX_SAFE_INTEGER ? true : creditsRemaining >= creditsNeeded

  const canGenerateNow =
    !!preview &&
    !isLoading &&
    !isAuthLoading &&
    isAuthed &&
    designFlowAllowed &&
    hasEnoughCredits

  const handleFile = (selectedFile: File) => {
    if (!selectedFile.type.startsWith('image/')) {
      toast({
        title: 'Unsupported file',
        description: 'Please select an image file.',
        variant: 'destructive',
      })
      return
    }

    setFile(selectedFile)
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreview(e.target?.result as string)
    }
    reader.readAsDataURL(selectedFile)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
  }

  const handleGenerate = async () => {
    if (!file || !preview) return

    if (!isAuthed) {
      toast({
        title: 'Login required',
        description: 'You must log in to generate content.',
        variant: 'destructive',
      })
      router.push(`/login?callbackUrl=${encodeURIComponent(callbackPath)}`)
      return
    }

    if (!designFlowAllowed) {
      toast({
        title: 'Not available on your plan',
        description: 'This flow needs studio preset and flat presentation access. Try upgrading.',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)
    let createdProjectId: string | null = null
    try {
      const resolvedGarmentType =
        productType === 'auto' ? undefined : productType === 'custom' ? customProductType.trim() || undefined : productType

      const refinementParts = [
        designRealizeRefinements.trim() || '',
        materialHint.trim()
          ? `Material/fabric hint: ${materialHint.trim()}. Keep it subtle and realistic (do not change the print/logos or silhouette).`
          : '',
      ].filter(Boolean)

      const editInstructions = refinementParts.length ? refinementParts.join(' ') : undefined

      const project = await addProject({
        name: file.name.replace(/\.[^/.]+$/, ''),
        originalImage: preview,
        originalImageName: file.name,
        generatedImages: [],
        generation: {
          status: 'idle',
          total: 0,
          completed: 0,
          preset: DESIGN_JOB_PRESET,
          pipeline: 'design_realize',
          renderStyleLevel,
        },
      })
      createdProjectId = project.id

      const enqueueRes = await fetch(`/api/projects/${project.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'initial',
          shotTypes: [DESIGN_JOB_SHOT],
          preset: DESIGN_JOB_PRESET,
          pipeline: 'design_realize',
          renderStyleLevel,
          ...(editInstructions ? { editInstructions } : {}),
          ...(resolvedGarmentType ? { garmentType: resolvedGarmentType } : {}),
        }),
      })

      if (!enqueueRes.ok) {
        const data = (await enqueueRes.json().catch(() => ({}))) as { error?: string; code?: string }
        if (data.code === 'email_not_verified') {
          toast({
            title: 'Email not verified',
            description: 'Please verify your email before generating content. Check your inbox or use the banner above to resend.',
            variant: 'destructive',
          })
          if (createdProjectId) deleteProject(createdProjectId)
          setIsLoading(false)
          return
        }
        throw new Error(data.error || 'Failed to enqueue generation')
      }

      // Navigate as soon as the generation is enqueued.
      void updateProject(project.id, {
        generation: {
          status: 'generating',
          total: creditsNeeded,
          completed: 0,
          nextType: DESIGN_JOB_SHOT,
          shotTypes: [DESIGN_JOB_SHOT],
          preset: DESIGN_JOB_PRESET,
          pipeline: 'design_realize',
          renderStyleLevel,
        },
      }).catch(() => {})

      router.push(`/dashboard/results/${project.id}`)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to generate. Please try again.'
      const statusErr =
        typeof e === 'object' && e !== null && 'status' in e ? (e as { status?: unknown }).status : undefined
      const isAuth = statusErr === 401 || /logged in|unauthorized/i.test(message)
      toast({
        title: isAuth ? 'Login required' : 'Generation failed',
        description: isAuth ? 'You must log in to generate content.' : message,
        variant: 'destructive',
      })
      if (isAuth) {
        router.push(`/login?callbackUrl=${encodeURIComponent(callbackPath)}`)
      } else if (createdProjectId) {
        deleteProject(createdProjectId)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 rounded-xl border border-border/60 bg-[#0a0a0a] p-5 sm:p-6">
          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-tight">{pageTitle}</h1>
          <p className="mt-4 max-w-2xl text-sm sm:text-base text-muted-foreground leading-relaxed">{pageDescription}</p>

          {!isAuthLoading && !isAuthed && (
            <div className="mt-6 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
              <span className="font-medium text-red-500 [text-shadow:0_0_10px_rgba(239,68,68,0.75)]">
                Login required to generate.
              </span>{' '}
              You can browse the dashboard, but generation is locked until you sign in.
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-8">
          <section className="space-y-6 rounded-2xl border border-border/60 bg-[#0a0a0a] p-4 sm:p-5">
            <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground ml-4">{sketchLabel}</div>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
              aria-label="Select sketch or mockup image"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
              }}
              className={cn(
                'group rounded-xl border border-white/15 bg-[#0a0a0a] shadow-sm transition-colors',
                isDragging ? 'border-accent/80' : 'hover:border-red-500/50 hover:shadow-[0_0_18px_rgba(239,68,68,0.25)] hover:bg-red-500/10'
              )}
            >
              <input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
                id="from-sketch-file-input"
                ref={fileInputRef}
              />

              <div className="block cursor-pointer p-6 sm:p-8">
                <div
                  className={cn(
                    'rounded-lg border border-dashed p-6 sm:p-8',
                    isDragging ? 'border-accent/80' : 'border-white/15 group-hover:border-red-500/40 transition-colors'
                  )}
                >
                  <div className="grid place-items-center">
                    {preview ? (
                      <div className="w-full max-w-[360px]">
                        <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-md bg-secondary/60 border border-white/15">
                          <Image
                            src={preview}
                            alt="Uploaded sketch or mockup preview"
                            fill
                            className="object-contain"
                            sizes="(min-width: 1024px) 420px, 100vw"
                          />
                        </div>
                        <p className="mt-4 text-center text-xs text-muted-foreground">Select files or drag and drop to replace</p>
                        {file?.name && <p className="mt-2 text-center text-xs text-muted-foreground truncate">{file.name}</p>}
                        <button
                          type="button"
                          className="mt-4 mx-auto block w-auto cursor-pointer rounded-sm border-2 border-red-500 bg-red-500/90 px-5 py-1.5 text-xs font-semibold tracking-wide text-white shadow-[0_0_0_2px_rgba(239,68,68,0.18),0_0_20px_rgba(239,68,68,0.18)] hover:bg-red-500"
                        >
                          Select files
                        </button>
                      </div>
                    ) : (
                      <div className="w-full max-w-[360px]">
                        <div className="mx-auto grid place-items-center">
                          <div className="mb-5 grid h-14 w-14 place-items-center rounded-md border border-white/15 text-muted-foreground">
                            <Upload className="h-6 w-6" />
                          </div>
                          <p className="text-center text-sm font-medium text-foreground">Upload sketch or mockup</p>
                          <p className="mt-2 text-center text-xs text-muted-foreground">PNG, JPG, or WebP — flat art, screenshot, or photo of a drawing.</p>
                          <button
                            type="button"
                            className="mt-5 mx-auto block w-auto cursor-pointer rounded-sm border-2 border-red-500 bg-red-500/90 px-5 py-1.5 text-xs font-semibold tracking-wide text-white shadow-[0_0_0_2px_rgba(239,68,68,0.18),0_0_20px_rgba(239,68,68,0.18)] hover:bg-red-500"
                          >
                            Select files
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="hidden lg:block mt-2">
              <Button
                onClick={handleGenerate}
                disabled={!canGenerateNow}
                className={cn(
                  'w-full rounded-full py-6 text-sm tracking-[0.35em] uppercase cursor-pointer disabled:cursor-not-allowed',
                  'bg-red-500/8 border border-red-500/35 text-foreground shadow-sm hover:bg-red-500/18 hover:border-red-500/70 hover:shadow-[0_0_18px_rgba(239,68,68,0.25)] transition-shadow'
                )}
                variant="outline"
              >
                {isLoading ? 'Generating…' : 'Generate 3D render'}
              </Button>
              {!designFlowAllowed ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  This quick flow is not available on your current plan (needs studio look + flat presentation).
                </p>
              ) : null}
              {!creditsSyncing && !hasEnoughCredits ? (
                <p className="mt-3 text-xs text-destructive">Not enough credits. You need 1 credit for this image.</p>
              ) : null}
            </div>
          </section>

          <aside className="rounded-t-none rounded-b-2xl border border-white/15 border-t-0 bg-[#0a0a0a] shadow-sm">
            <div className="border-t border-white/15 px-6 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-6">
              {isAuthed ? (
                <div className="mb-6 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Credits</p>
                  <p className="mt-1 text-lg font-bold leading-none">
                    {creditsRemaining == null ? '...' : creditsLimit != null && creditsLimit < 0 ? 'Unlimited' : creditsRemaining}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-tight">1 credit per image</p>
                  {creditsSyncing ? <p className="text-[10px] text-muted-foreground mt-1">Syncing latest usage...</p> : null}
                </div>
              ) : null}

              <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">Product type (optional)</div>
              <div className="mt-3">
                <Select value={productType} onValueChange={(v) => setProductType(v as typeof productType)}>
                  <SelectTrigger className="w-full cursor-pointer">
                    <SelectValue placeholder="Auto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="hoodie">Hoodie</SelectItem>
                    <SelectItem value="tshirt">T-Shirt</SelectItem>
                    <SelectItem value="jacket">Jacket</SelectItem>
                    <SelectItem value="sweatshirt">Sweatshirt</SelectItem>
                    <SelectItem value="pants">Pants</SelectItem>
                    <SelectItem value="custom">Other (type below)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {productType === 'custom' ? (
                <div className="mt-3">
                  <Input value={customProductType} onChange={(e) => setCustomProductType(e.target.value)} placeholder="e.g. shorts, dress, cap…" />
                </div>
              ) : null}

              {isProtoRealMode ? (
                <div className="mt-6">
                  <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">Render style</div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Fixed for this flow: <span className="text-foreground">Semi-real CGI (ProtoReal)</span>
                  </p>
                </div>
              ) : (
                <div className="mt-6">
                  <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">Render style</div>
                  <div className="mt-3">
                    <Select value={renderStyleLevel} onValueChange={(v) => setRenderStyleLevel(v as RenderStyleLevel)}>
                      <SelectTrigger className="w-full cursor-pointer">
                        <SelectValue placeholder="Clean CGI" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="clean_cgi">Clean CGI (least life-like)</SelectItem>
                        <SelectItem value="semi_real_cgi">Semi-real CGI</SelectItem>
                        <SelectItem value="toon_tech">Toon-tech 3D</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="mt-6">
                <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">Refinement instructions (optional)</div>
                <Textarea
                  value={designRealizeRefinements}
                  onChange={(e) => setDesignRealizeRefinements(e.target.value)}
                  className="mt-3"
                  rows={3}
                  placeholder="e.g. Match the sketch colorway (e.g. dark navy + off-white print); reduce dust; fix muddy lighting; brighten studio lighting slightly; keep print placement unchanged."
                  aria-label="Design realize refinement instructions"
                  disabled={isLoading}
                />
              </div>

              <div className="mt-4">
                <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">Material / fabric hint (optional)</div>
                <Input
                  value={materialHint}
                  onChange={(e) => setMaterialHint(e.target.value)}
                  placeholder="e.g. heavy cotton french terry (dark navy); ribbed cuffs; hoodie pocket; metal zipper"
                  className="mt-3"
                  disabled={isLoading}
                />
              </div>

              <div className="mt-10 lg:hidden">
                <Button
                  onClick={handleGenerate}
                  disabled={!canGenerateNow}
                  className={cn(
                    'w-full rounded-full py-6 text-sm tracking-[0.35em] uppercase cursor-pointer disabled:cursor-not-allowed',
                    'bg-red-500/8 border border-red-500/35 text-foreground shadow-sm hover:bg-red-500/18 hover:border-red-500/70 hover:shadow-[0_0_18px_rgba(239,68,68,0.25)] transition-shadow'
                  )}
                  variant="outline"
                >
                  {isLoading ? 'Generating…' : 'Generate 3D render'}
                </Button>
                {!designFlowAllowed ? <p className="mt-3 text-xs text-muted-foreground">This flow is not available on your current plan.</p> : null}
                {!hasEnoughCredits ? <p className="mt-3 text-xs text-destructive">Not enough credits. You need 1 credit.</p> : null}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}


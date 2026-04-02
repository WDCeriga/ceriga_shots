'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
import { uploadGenerationSourceImageToR2, uploadOriginalImageToR2 } from '@/lib/original-image-upload-client'

/** Internal job type for queue + meta. ProtoReal uses garment_photo prompt pipeline. */
const DESIGN_JOB_SHOT = 'flatlay_topdown' as const
const DESIGN_JOB_PRESET = 'studio' as const

const FROM_SKETCH_PATH = '/dashboard/generate/from-sketch'
const PROTOREAL_PATH = '/dashboard/generate/protoreal'

export type DesignRealizeMode = 'sketch3d' | 'protoreal'
type ProductTypeOption =
  | 'auto'
  | 'tshirt'
  | 'hoodie'
  | 'sweatshirt'
  | 'jacket'
  | 'joggers'
  | 'shorts'
  | 'cap'
  | 'beanie'
  | 'tote_bag'
  | 'sneakers'
  | 'other'
type FitStyleOption = 'auto' | 'regular' | 'oversized' | 'boxy' | 'slim'
type FitStyleOptionExtended = FitStyleOption | 'other'
type MaterialOption = 'auto' | 'cotton' | 'heavyweight_cotton' | 'fleece' | 'nylon' | 'denim' | 'leather' | 'other'
type BrandingOption = 'auto' | 'none' | 'screen_print' | 'puff_print' | 'embroidery' | 'minimal_logo' | 'large_graphic' | 'other'
type FinishWashOption = 'auto' | 'clean_new' | 'washed' | 'vintage_fade' | 'other'
type FabricWeightOption = 'lightweight' | 'midweight' | 'heavyweight'
type SketchDesignTypeOption = 'none' | 'small_logo' | 'large_graphic' | 'full_print'

const PRODUCT_TYPE_LABEL: Record<ProductTypeOption, string> = {
  auto: 'Auto',
  tshirt: 'T-Shirt',
  hoodie: 'Hoodie',
  sweatshirt: 'Sweatshirt',
  jacket: 'Jacket',
  joggers: 'Joggers',
  shorts: 'Shorts',
  cap: 'Cap',
  beanie: 'Beanie',
  tote_bag: 'Tote bag',
  sneakers: 'Sneakers',
  other: 'Other (type below)',
}

const FIT_STYLE_LABEL: Record<FitStyleOption, string> = {
  auto: 'Auto',
  regular: 'Regular',
  oversized: 'Oversized',
  boxy: 'Boxy',
  slim: 'Slim',
}

const MATERIAL_LABEL: Record<MaterialOption, string> = {
  auto: 'Auto',
  cotton: 'Cotton',
  heavyweight_cotton: 'Heavyweight cotton',
  fleece: 'Fleece',
  nylon: 'Nylon',
  denim: 'Denim',
  leather: 'Leather',
  other: 'Other (type below)',
}

const BRANDING_LABEL: Record<BrandingOption, string> = {
  auto: 'Auto',
  none: 'None (blank)',
  screen_print: 'Screen print',
  puff_print: 'Puff print',
  embroidery: 'Embroidery',
  minimal_logo: 'Minimal logo',
  large_graphic: 'Large graphic',
  other: 'Other (type below)',
}

const FINISH_WASH_LABEL: Record<FinishWashOption, string> = {
  auto: 'Auto',
  clean_new: 'Clean (new)',
  washed: 'Washed',
  vintage_fade: 'Vintage fade',
  other: 'Other (type below)',
}

const FABRIC_WEIGHT_LABEL: Record<FabricWeightOption, string> = {
  lightweight: 'Lightweight',
  midweight: 'Midweight',
  heavyweight: 'Heavyweight',
}

const SKETCH_DESIGN_TYPE_LABEL: Record<SketchDesignTypeOption, string> = {
  none: 'None (blank)',
  small_logo: 'Small logo',
  large_graphic: 'Large graphic',
  full_print: 'Full print',
}

const CLOTHING_PRODUCT_TYPES = new Set<ProductTypeOption>([
  'tshirt',
  'hoodie',
  'sweatshirt',
  'jacket',
  'joggers',
  'shorts',
])

export function DesignRealizeGeneratePage({ mode = 'sketch3d' }: { mode?: DesignRealizeMode }) {
  const isProtoRealMode = mode === 'protoreal'
  const generationPipeline = isProtoRealMode ? 'garment_photo' : 'design_realize'
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
  const [productType, setProductType] = useState<ProductTypeOption>('auto')
  const [customProductType, setCustomProductType] = useState('')
  const [fitStyle, setFitStyle] = useState<FitStyleOptionExtended>('auto')
  const [customFitStyle, setCustomFitStyle] = useState('')
  const [materialType, setMaterialType] = useState<MaterialOption>('auto')
  const [customMaterialType, setCustomMaterialType] = useState('')
  const [brandingType, setBrandingType] = useState<BrandingOption>('none')
  const [customBrandingType, setCustomBrandingType] = useState('')
  const [finishWash, setFinishWash] = useState<FinishWashOption>('auto')
  const [customFinishWash, setCustomFinishWash] = useState('')
  const [customNotes, setCustomNotes] = useState('')
  const [sketchFabricWeight, setSketchFabricWeight] = useState<FabricWeightOption>('midweight')
  const [sketchDesignType, setSketchDesignType] = useState<SketchDesignTypeOption>('none')
  const [sketchExtraInstructions, setSketchExtraInstructions] = useState('')
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

  useEffect(() => {
    // Prevent leaking object URLs when the user replaces the file.
    if (!preview?.startsWith('blob:')) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

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
  const showFitStyle = isProtoRealMode && CLOTHING_PRODUCT_TYPES.has(productType)
  const showSketchFitStructure = !isProtoRealMode && CLOTHING_PRODUCT_TYPES.has(productType)

  useEffect(() => {
    if (isProtoRealMode) return
    if (productType === 'hoodie') {
      setMaterialType('fleece')
      setSketchFabricWeight('heavyweight')
      setFitStyle('regular')
      return
    }
    if (productType === 'tshirt') {
      setMaterialType('cotton')
      setSketchFabricWeight('midweight')
      setFitStyle('regular')
      return
    }
    if (productType === 'sweatshirt') {
      setMaterialType('fleece')
      setSketchFabricWeight('heavyweight')
      setFitStyle('regular')
      return
    }
    if (productType === 'jacket') {
      setMaterialType('nylon')
      setSketchFabricWeight('midweight')
      setFitStyle('regular')
      return
    }
    if (productType === 'joggers') {
      setMaterialType('fleece')
      setSketchFabricWeight('midweight')
      setFitStyle('regular')
      return
    }
    if (productType === 'shorts') {
      setMaterialType('cotton')
      setSketchFabricWeight('lightweight')
      setFitStyle('regular')
      return
    }
    if (productType === 'sneakers') {
      setMaterialType('leather')
      setSketchFabricWeight('midweight')
      return
    }
    if (productType === 'cap' || productType === 'beanie' || productType === 'tote_bag') {
      setMaterialType('cotton')
      setSketchFabricWeight('midweight')
    }
  }, [isProtoRealMode, productType])

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
    setPreview(URL.createObjectURL(selectedFile))
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
        productType === 'auto'
          ? undefined
          : productType === 'other'
            ? customProductType.trim() || undefined
            : PRODUCT_TYPE_LABEL[productType]

      const protoRealPromptParts = isProtoRealMode
        ? [
            productType !== 'auto' && productType !== 'other' ? `Product type: ${PRODUCT_TYPE_LABEL[productType]}.` : '',
            productType === 'other' && customProductType.trim() ? `Product type: ${customProductType.trim()}.` : '',
            showFitStyle && fitStyle !== 'auto'
              ? `Fit/style: ${
                  fitStyle === 'other' ? customFitStyle.trim() || 'custom' : FIT_STYLE_LABEL[fitStyle as FitStyleOption]
                }.`
              : '',
            materialType !== 'auto'
              ? `Material: ${materialType === 'other' ? customMaterialType.trim() || 'custom' : MATERIAL_LABEL[materialType]}.`
              : '',
            brandingType !== 'auto'
              ? `Print/branding type: ${
                  brandingType === 'other' ? customBrandingType.trim() || 'custom' : BRANDING_LABEL[brandingType]
                }.`
              : '',
            finishWash !== 'auto'
              ? `Finish/wash: ${
                  finishWash === 'other' ? customFinishWash.trim() || 'custom' : FINISH_WASH_LABEL[finishWash]
                }.`
              : '',
            customNotes.trim() ? `Custom notes: ${customNotes.trim()}.` : '',
          ].filter(Boolean)
        : []

      const sketchPromptParts = !isProtoRealMode
        ? [
            productType !== 'auto' && productType !== 'other' ? `Product type: ${PRODUCT_TYPE_LABEL[productType]}.` : '',
            productType === 'other' && customProductType.trim() ? `Product type: ${customProductType.trim()}.` : '',
            showSketchFitStructure
              ? `Fit/structure: ${
                  fitStyle === 'other' || fitStyle === 'auto' ? 'Regular' : FIT_STYLE_LABEL[fitStyle as FitStyleOption]
                }.`
              : '',
            materialType !== 'auto'
              ? `Material: ${materialType === 'other' ? customMaterialType.trim() || 'custom' : MATERIAL_LABEL[materialType]}.`
              : '',
            `Fabric weight: ${FABRIC_WEIGHT_LABEL[sketchFabricWeight]}.`,
            `Design type: ${SKETCH_DESIGN_TYPE_LABEL[sketchDesignType]}.`,
            sketchExtraInstructions.trim() ? `Extra instructions: ${sketchExtraInstructions.trim()}.` : '',
          ].filter(Boolean)
        : []

      const refinementParts = isProtoRealMode ? protoRealPromptParts : sketchPromptParts

      const editInstructions = refinementParts.length ? refinementParts.join(' ') : undefined

      const originalImageUrl = await uploadOriginalImageToR2(file)
      const sourceImageUrl = await uploadGenerationSourceImageToR2(file)

      const project = await addProject({
        name: file.name.replace(/\.[^/.]+$/, ''),
        originalImage: originalImageUrl,
        originalImageName: file.name,
        generatedImages: [],
        generation: {
          status: 'idle',
          total: 0,
          completed: 0,
          preset: DESIGN_JOB_PRESET,
          pipeline: generationPipeline,
          renderStyleLevel,
          sourceImageUrl,
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
          pipeline: generationPipeline,
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
          pipeline: generationPipeline,
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
    <div className="relative overflow-hidden px-6 py-10 sm:px-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.1]"
        style={{
          backgroundImage:
            'linear-gradient(var(--color-foreground) 1px, transparent 1px), linear-gradient(90deg, var(--color-foreground) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
        }}
      />
      <div className="relative mx-auto max-w-6xl">
        <div className="mb-10 max-w-2xl space-y-3">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl">{pageTitle}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">{pageDescription}</p>

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
                          <img
                            src={preview}
                            alt="Uploaded sketch or mockup preview"
                            className="h-full w-full object-contain"
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
                className="h-12 w-full rounded-xl text-sm font-semibold tracking-wide disabled:cursor-not-allowed"
              >
                {isLoading ? 'Generating…' : isProtoRealMode ? 'Generate photoreal mockup' : 'Generate 3D render'}
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

              <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">
                {isProtoRealMode ? 'Product type (optional)' : 'Product type'}
              </div>
              <div className="mt-3">
                <Select value={productType} onValueChange={(v) => setProductType(v as typeof productType)}>
                  <SelectTrigger className="w-full cursor-pointer">
                    <SelectValue placeholder="Auto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tshirt">T-Shirt</SelectItem>
                    <SelectItem value="hoodie">Hoodie</SelectItem>
                    <SelectItem value="sweatshirt">Sweatshirt</SelectItem>
                    <SelectItem value="jacket">Jacket</SelectItem>
                    <SelectItem value="joggers">Joggers</SelectItem>
                    <SelectItem value="shorts">Shorts</SelectItem>
                    <SelectItem value="cap">Cap</SelectItem>
                    <SelectItem value="beanie">Beanie</SelectItem>
                    <SelectItem value="tote_bag">Tote Bag</SelectItem>
                    <SelectItem value="sneakers">Sneakers</SelectItem>
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="other">Other (type)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {productType === 'other' ? (
                <div className="mt-3">
                  <Input
                    value={customProductType}
                    onChange={(e) => setCustomProductType(e.target.value)}
                    placeholder="Type custom product type"
                    disabled={isLoading}
                  />
                </div>
              ) : null}

              {isProtoRealMode ? (
                <div className="mt-6 space-y-4">
                  {showFitStyle ? (
                    <div>
                      <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">Fit / style</div>
                      <div className="mt-3">
                        <Select value={fitStyle} onValueChange={(v) => setFitStyle(v as FitStyleOption)}>
                          <SelectTrigger className="w-full cursor-pointer">
                            <SelectValue placeholder="Auto" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="regular">Regular</SelectItem>
                            <SelectItem value="oversized">Oversized</SelectItem>
                            <SelectItem value="boxy">Boxy</SelectItem>
                            <SelectItem value="slim">Slim</SelectItem>
                            <SelectItem value="auto">Auto</SelectItem>
                            <SelectItem value="other">Other (type)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {fitStyle === 'other' ? (
                        <div className="mt-3">
                          <Input
                            value={customFitStyle}
                            onChange={(e) => setCustomFitStyle(e.target.value)}
                            placeholder="Type custom fit/style"
                            disabled={isLoading}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div>
                    <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">Material</div>
                    <div className="mt-3">
                      <Select value={materialType} onValueChange={(v) => setMaterialType(v as MaterialOption)}>
                        <SelectTrigger className="w-full cursor-pointer">
                          <SelectValue placeholder="Auto" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cotton">Cotton</SelectItem>
                          <SelectItem value="heavyweight_cotton">Heavyweight Cotton</SelectItem>
                          <SelectItem value="fleece">Fleece</SelectItem>
                          <SelectItem value="nylon">Nylon</SelectItem>
                          <SelectItem value="denim">Denim</SelectItem>
                          <SelectItem value="leather">Leather</SelectItem>
                          <SelectItem value="auto">Auto</SelectItem>
                          <SelectItem value="other">Other (type)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {materialType === 'other' ? (
                      <div className="mt-3">
                        <Input
                          value={customMaterialType}
                          onChange={(e) => setCustomMaterialType(e.target.value)}
                          placeholder="Type custom material"
                          disabled={isLoading}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">Print / branding type</div>
                    <div className="mt-3">
                      <Select value={brandingType} onValueChange={(v) => setBrandingType(v as BrandingOption)}>
                        <SelectTrigger className="w-full cursor-pointer">
                          <SelectValue placeholder="Auto" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None (blank)</SelectItem>
                          <SelectItem value="screen_print">Screen print</SelectItem>
                          <SelectItem value="puff_print">Puff print</SelectItem>
                          <SelectItem value="embroidery">Embroidery</SelectItem>
                          <SelectItem value="minimal_logo">Minimal logo</SelectItem>
                          <SelectItem value="large_graphic">Large graphic</SelectItem>
                          <SelectItem value="auto">Auto</SelectItem>
                          <SelectItem value="other">Other (type)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {brandingType === 'other' ? (
                      <div className="mt-3">
                        <Input
                          value={customBrandingType}
                          onChange={(e) => setCustomBrandingType(e.target.value)}
                          placeholder="Type custom print/branding type"
                          disabled={isLoading}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">Finish / wash</div>
                    <div className="mt-3">
                      <Select value={finishWash} onValueChange={(v) => setFinishWash(v as FinishWashOption)}>
                        <SelectTrigger className="w-full cursor-pointer">
                          <SelectValue placeholder="Auto" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="clean_new">Clean (new)</SelectItem>
                          <SelectItem value="washed">Washed</SelectItem>
                          <SelectItem value="vintage_fade">Vintage fade</SelectItem>
                          <SelectItem value="auto">Auto</SelectItem>
                          <SelectItem value="other">Other (type)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {finishWash === 'other' ? (
                      <div className="mt-3">
                        <Input
                          value={customFinishWash}
                          onChange={(e) => setCustomFinishWash(e.target.value)}
                          placeholder="Type custom finish/wash"
                          disabled={isLoading}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">Custom notes (optional)</div>
                    <Textarea
                      value={customNotes}
                      onChange={(e) => setCustomNotes(e.target.value)}
                      className="mt-3"
                      rows={2}
                      placeholder="Anything specific? (e.g. small logo, centered, subtle look)"
                      aria-label="Custom notes"
                      disabled={isLoading}
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {showSketchFitStructure ? (
                    <div>
                      <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">Fit / structure</div>
                      <div className="mt-3">
                        <Select value={fitStyle} onValueChange={(v) => setFitStyle(v as FitStyleOptionExtended)}>
                          <SelectTrigger className="w-full cursor-pointer">
                            <SelectValue placeholder="Regular" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="regular">Regular</SelectItem>
                            <SelectItem value="oversized">Oversized</SelectItem>
                            <SelectItem value="boxy">Boxy</SelectItem>
                            <SelectItem value="slim">Slim</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">Material</div>
                    <div className="mt-3">
                      <Select value={materialType} onValueChange={(v) => setMaterialType(v as MaterialOption)}>
                        <SelectTrigger className="w-full cursor-pointer">
                          <SelectValue placeholder="Auto" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cotton">Cotton</SelectItem>
                          <SelectItem value="heavyweight_cotton">Heavyweight cotton</SelectItem>
                          <SelectItem value="fleece">Fleece</SelectItem>
                          <SelectItem value="nylon">Nylon</SelectItem>
                          <SelectItem value="denim">Denim</SelectItem>
                          <SelectItem value="leather">Leather</SelectItem>
                          <SelectItem value="auto">Auto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">Weight</div>
                    <div className="mt-3">
                      <Select value={sketchFabricWeight} onValueChange={(v) => setSketchFabricWeight(v as FabricWeightOption)}>
                        <SelectTrigger className="w-full cursor-pointer">
                          <SelectValue placeholder="Midweight" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lightweight">Lightweight</SelectItem>
                          <SelectItem value="midweight">Midweight</SelectItem>
                          <SelectItem value="heavyweight">Heavyweight</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">Render style</div>
                    <div className="mt-3">
                      <Select value={renderStyleLevel} onValueChange={(v) => setRenderStyleLevel(v as RenderStyleLevel)}>
                        <SelectTrigger className="w-full cursor-pointer">
                          <SelectValue placeholder="Studio Clean (sharp, minimal)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="clean_cgi">Studio Clean (sharp, minimal)</SelectItem>
                          <SelectItem value="semi_real_cgi">Realistic (soft shadows, natural)</SelectItem>
                          <SelectItem value="toon_tech">Stylized 3D (slightly exaggerated)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">Design type</div>
                    <div className="mt-3">
                      <Select value={sketchDesignType} onValueChange={(v) => setSketchDesignType(v as SketchDesignTypeOption)}>
                        <SelectTrigger className="w-full cursor-pointer">
                          <SelectValue placeholder="None (blank)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None (blank)</SelectItem>
                          <SelectItem value="small_logo">Small logo</SelectItem>
                          <SelectItem value="large_graphic">Large graphic</SelectItem>
                          <SelectItem value="full_print">Full print</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                </div>
              )}

              {!isProtoRealMode ? (
                <div className="mt-6">
                  <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">Extra instructions (optional)</div>
                  <Textarea
                    value={sketchExtraInstructions}
                    onChange={(e) => setSketchExtraInstructions(e.target.value)}
                    className="mt-3"
                    rows={3}
                    placeholder="Anything else to refine while keeping design identity?"
                    aria-label="Extra instructions"
                    disabled={isLoading}
                  />
                </div>
              ) : null}

              <div className="mt-10 lg:hidden">
                <Button
                  onClick={handleGenerate}
                  disabled={!canGenerateNow}
                  className="h-12 w-full rounded-xl text-sm font-semibold tracking-wide disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Generating…' : isProtoRealMode ? 'Generate photoreal mockup' : 'Generate 3D render'}
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


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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type VisualDirectionKey = 'raw' | 'editorial' | 'luxury' | 'natural' | 'studio' | 'surprise'

const VISUAL_DIRECTIONS: Array<{
  key: VisualDirectionKey
  title: string
  subtitle: string
  swatchClassName: string
}> = [
  {
    key: 'raw',
    title: 'Raw',
    subtitle: 'Dark concrete, hard light',
    swatchClassName:
      'bg-[linear-gradient(135deg,rgba(9,9,11,0.92),rgba(39,39,42,0.65),rgba(244,244,245,0.08))]',
  },
  {
    key: 'studio',
    title: 'Studio',
    subtitle: 'White backdrop, studio lighting',
    swatchClassName:
      'bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(229,231,235,0.60),rgba(209,213,219,0.30))]',
  },
  {
    key: 'editorial',
    title: 'Editorial',
    subtitle: 'Seamless charcoal, diffused, cold',
    swatchClassName:
      'bg-[linear-gradient(135deg,rgba(15,23,42,0.90),rgba(51,65,85,0.55),rgba(226,232,240,0.06))]',
  },
  {
    key: 'luxury',
    title: 'Luxury',
    subtitle: 'Dark marble, soft overhead',
    swatchClassName:
      'bg-[linear-gradient(135deg,rgba(3,7,18,0.92),rgba(24,24,27,0.70),rgba(212,212,216,0.06))]',
  },
  {
    key: 'natural',
    title: 'Natural',
    subtitle: 'Aged wood, window light',
    swatchClassName:
      'bg-[linear-gradient(135deg,rgba(120,53,15,0.60),rgba(180,83,9,0.35),rgba(254,243,199,0.10))]',
  },
  { key: 'surprise', title: 'Surprise me', subtitle: 'Random, never the same', swatchClassName: '' },
]

type ShotTypeKey =
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

const SHOT_TYPES: Array<{ key: ShotTypeKey; label: string }> = [
  { key: 'flatlay_topdown', label: 'Top-down flat lay' },
  { key: 'flatlay_45deg', label: '45° angled flat lay' },
  { key: 'flatlay_sleeves', label: 'Symmetrical sleeve spread' },
  { key: 'flatlay_relaxed', label: 'Relaxed / crumpled flat lay' },
  { key: 'flatlay_folded', label: 'Folded logo shot' },
  { key: 'surface_draped', label: 'Draped over surface' },
  { key: 'surface_hanging', label: 'Hanging shot' },
  { key: 'detail_print', label: 'Print close-up' },
  { key: 'detail_fabric', label: 'Fabric texture macro' },
  { key: 'detail_collar', label: 'Collar / neckline detail' },
]

const HEADING_WORDS = ['Drop', 'Campaign', 'Vision', 'Standard'] as const

type HeadingAnimVariantKey = 'flip' | 'slide' | 'accordion' | 'cuboid' | 'typing'
type NonTypingHeadingAnimVariantKey = Exclude<HeadingAnimVariantKey, 'typing'>

const HEADING_ANIM_VARIANTS: Record<
  NonTypingHeadingAnimVariantKey,
  { visible: string; hidden: string; out: string; in: string }
> = {
  flip: { visible: 'heading-flip-visible', hidden: 'heading-flip-hidden', out: 'heading-flip-out', in: 'heading-flip-in' },
  slide: { visible: 'heading-slide-visible', hidden: 'heading-slide-hidden', out: 'heading-slide-out', in: 'heading-slide-in' },
  accordion: {
    visible: 'heading-accordion-visible',
    hidden: 'heading-accordion-hidden',
    out: 'heading-accordion-out',
    in: 'heading-accordion-in',
  },
  cuboid: { visible: 'heading-cuboid-visible', hidden: 'heading-cuboid-hidden', out: 'heading-cuboid-out', in: 'heading-cuboid-in' },
}

const HEADING_ANIM_LABELS: Record<HeadingAnimVariantKey, string> = {
  flip: 'Flip',
  slide: 'Slide',
  accordion: 'Accordion',
  cuboid: 'Cuboid',
  typing: 'Typing',
}

const HEADING_WORD_WIDTH_ANCHOR = HEADING_WORDS.reduce((acc, w) => (w.length > acc.length ? w : acc), HEADING_WORDS[0])
const HEADING_WORD_WIDTH_CHARS = HEADING_WORD_WIDTH_ANCHOR.length

export default function GeneratePage() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string>('')
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [visualDirection, setVisualDirection] = useState<VisualDirectionKey>('raw')
  const [productType, setProductType] = useState<'auto' | 'hoodie' | 'tshirt' | 'jacket' | 'sweatshirt' | 'pants' | 'custom'>(
    'auto'
  )
  const [customProductType, setCustomProductType] = useState('')
  const [surpriseSwatchClassName] = useState(() => {
    const options = [
      'bg-[linear-gradient(135deg,rgba(14,116,144,0.55),rgba(30,58,138,0.45),rgba(244,244,245,0.06))]',
      'bg-[linear-gradient(135deg,rgba(190,18,60,0.45),rgba(88,28,135,0.45),rgba(244,244,245,0.06))]',
      'bg-[linear-gradient(135deg,rgba(22,101,52,0.50),rgba(5,46,22,0.45),rgba(244,244,245,0.06))]',
      'bg-[linear-gradient(135deg,rgba(180,83,9,0.55),rgba(124,45,18,0.40),rgba(254,243,199,0.08))]',
      'bg-[linear-gradient(135deg,rgba(30,41,59,0.70),rgba(2,6,23,0.65),rgba(226,232,240,0.06))]',
      'bg-[linear-gradient(135deg,rgba(7,89,133,0.50),rgba(17,24,39,0.55),rgba(255,255,255,0.05))]',
    ]
    return options[Math.floor(Math.random() * options.length)]
  })
  const [shotTypes, setShotTypes] = useState<Set<ShotTypeKey>>(
    // Start with a low-cost baseline selection; users can add more from Results.
    () => new Set(['flatlay_topdown', 'detail_print'])
  )
  const { addProject, deleteProject, updateProject } = useProjects()
  const router = useRouter()
  const { status } = useSession()
  const { limits } = useRole()
  const isAuthed = status === 'authenticated'
  const isAuthLoading = status === 'loading'
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null)
  const [creditsLimit, setCreditsLimit] = useState<number | null>(null)
  const [creditsSyncing, setCreditsSyncing] = useState(false)
  const [headingWordIndex, setHeadingWordIndex] = useState(0)
  const [nextHeadingWordIndex, setNextHeadingWordIndex] = useState(() => 1 % HEADING_WORDS.length)
  const [isHeadingWordRolling, setIsHeadingWordRolling] = useState(false)
  const [activeHeadingAnimVariant, setActiveHeadingAnimVariant] = useState<HeadingAnimVariantKey>('typing')
  const [typingCharCount, setTypingCharCount] = useState(0)
  const [typingPhase, setTypingPhase] = useState<'type' | 'hold' | 'delete'>('type')
  const typingTimeoutRef = useRef<number | null>(null)
  const headingWordIndexRef = useRef(0)
  const isHeadingWordRollingRef = useRef(false)

  useEffect(() => {
    if (!isAuthed) {
      setCreditsRemaining(null)
      setCreditsLimit(null)
      setCreditsSyncing(false)
      return
    }

    // Instant optimistic values so UI is responsive before /api/me resolves.
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
        if (
          typeof cached.ts === 'number' &&
          Date.now() - cached.ts < 60_000 &&
          typeof cached.remaining === 'number'
        ) {
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
        return (await res.json()) as {
          user?: { credits?: { remaining?: number; limit?: number } | null }
        }
      })
      .then((data) => {
        if (cancelled) return
        const remaining = data?.user?.credits?.remaining
        const limit = data?.user?.credits?.limit
        setCreditsRemaining(typeof remaining === 'number' ? remaining : null)
        setCreditsLimit(typeof limit === 'number' ? limit : null)
        if (typeof remaining === 'number' && typeof limit === 'number') {
          try {
            window.localStorage.setItem(
              'credits-cache',
              JSON.stringify({ remaining, limit, ts: Date.now() })
            )
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
    headingWordIndexRef.current = headingWordIndex
  }, [headingWordIndex])

  useEffect(() => {
    if (activeHeadingAnimVariant === 'typing') {
      setIsHeadingWordRolling(false)
      isHeadingWordRollingRef.current = false
      return
    }

    // 3D “cuboid roll” for the heading word.
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const intervalMs = 2600
    const rollMs = 240

    let timeoutId: number | null = null

    const id = window.setInterval(() => {
      if (media?.matches) {
        setHeadingWordIndex((idx) => (idx + 1) % HEADING_WORDS.length)
        return
      }

      if (isHeadingWordRollingRef.current) return

      const current = headingWordIndexRef.current
      const next = (current + 1) % HEADING_WORDS.length

      setNextHeadingWordIndex(next)
      setIsHeadingWordRolling(true)
      isHeadingWordRollingRef.current = true

      timeoutId = window.setTimeout(() => {
        headingWordIndexRef.current = next
        setHeadingWordIndex(next)
        setIsHeadingWordRolling(false)
        isHeadingWordRollingRef.current = false
        timeoutId = null
      }, rollMs)
    }, intervalMs)

    return () => {
      if (timeoutId != null) window.clearTimeout(timeoutId)
      window.clearInterval(id)
    }
  }, [activeHeadingAnimVariant])

  useEffect(() => {
    // Reset typing animation when switching modes.
    if (activeHeadingAnimVariant !== 'typing') return

    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (media?.matches) {
      setTypingPhase('hold')
      setTypingCharCount(HEADING_WORDS[headingWordIndex]?.length ?? 0)
      return
    }

    setTypingPhase('type')
    setTypingCharCount(0)
  }, [activeHeadingAnimVariant, headingWordIndex])

  useEffect(() => {
    if (activeHeadingAnimVariant !== 'typing') return

    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (media?.matches) return

    const word = HEADING_WORDS[headingWordIndex]

    const typeMs = 90
    const holdMs = 800
    const deleteMs = 45

    if (typingTimeoutRef.current != null) window.clearTimeout(typingTimeoutRef.current)

    if (typingPhase === 'type') {
      if (typingCharCount < word.length) {
        typingTimeoutRef.current = window.setTimeout(() => {
          setTypingCharCount((c) => c + 1)
        }, typeMs)
      } else {
        setTypingPhase('hold')
      }
    } else if (typingPhase === 'hold') {
      typingTimeoutRef.current = window.setTimeout(() => {
        setTypingPhase('delete')
      }, holdMs)
    } else {
      if (typingCharCount > 0) {
        typingTimeoutRef.current = window.setTimeout(() => {
          setTypingCharCount((c) => c - 1)
        }, deleteMs)
      } else {
        const next = (headingWordIndex + 1) % HEADING_WORDS.length
        setHeadingWordIndex(next)
        setTypingPhase('type')
      }
    }

    return () => {
      if (typingTimeoutRef.current != null) window.clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }
  }, [activeHeadingAnimVariant, headingWordIndex, typingCharCount, typingPhase])

  const availableShotTypes = useMemo(() => {
    return SHOT_TYPES.filter((t) => {
      if (limits.blockedShotTypes.includes(t.key)) return false
      if ((t.key === 'surface_draped' || t.key === 'surface_hanging') && !limits.surfaceShots) return false
      if (limits.detailShots === 'none' && t.key.startsWith('detail_')) return false
      if (limits.detailShots === 'print' && (t.key === 'detail_fabric' || t.key === 'detail_collar'))
        return false
      return true
    })
  }, [limits.blockedShotTypes, limits.detailShots, limits.surfaceShots])
  const sortedShotTypes = useMemo(() => {
    const enabled = new Set(availableShotTypes.map((t) => t.key))
    return [...SHOT_TYPES].sort((a, b) => {
      const aEnabled = enabled.has(a.key)
      const bEnabled = enabled.has(b.key)
      if (aEnabled === bEnabled) return 0
      return aEnabled ? -1 : 1
    })
  }, [availableShotTypes])

  useEffect(() => {
    if (!limits.presets.includes(visualDirection)) {
      setVisualDirection(limits.presets[0] ?? 'studio')
    }
  }, [limits.presets, visualDirection])

  useEffect(() => {
    setShotTypes((prev) => {
      const filtered = Array.from(prev).filter((k) => availableShotTypes.some((t) => t.key === k))
      const flatlays = filtered.filter((k) => k.startsWith('flatlay_'))
      if (flatlays.length <= limits.flatLayTypes) return new Set(filtered)

      const keptFlatlays = flatlays.slice(0, limits.flatLayTypes)
      const next = filtered.filter((k) => !k.startsWith('flatlay_')).concat(keptFlatlays)
      return new Set(next)
    })
  }, [availableShotTypes, limits.flatLayTypes])

  const selectedAllowedCount = Array.from(shotTypes).filter((k) =>
    availableShotTypes.some((t) => t.key === k)
  ).length
  const hasEnoughCredits =
    creditsRemaining == null || creditsRemaining === Number.MAX_SAFE_INTEGER
      ? true
      : creditsRemaining >= selectedAllowedCount
  const canGenerateNow =
    !!preview &&
    !isLoading &&
    !isAuthLoading &&
    isAuthed &&
    selectedAllowedCount > 0 &&
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
    if (e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleGenerate = async () => {
    if (!file || !preview) return

    if (!isAuthed) {
      toast({
        title: 'Login required',
        description: 'You must log in to generate content.',
        variant: 'destructive',
      })
      router.push(`/login?callbackUrl=${encodeURIComponent('/dashboard/generate')}`)
      return
    }

    const allowedShotTypes = Array.from(shotTypes).filter((k) =>
      availableShotTypes.some((t) => t.key === k)
    )
    if (allowedShotTypes.length === 0) {
      toast({
        title: 'No valid shot types selected',
        description: 'Your current plan does not allow the selected shot types.',
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
          : productType === 'custom'
            ? customProductType.trim() || undefined
            : productType

      const project = await addProject({
        name: file.name.replace(/\.[^/.]+$/, ''),
        originalImage: preview,
        originalImageName: file.name,
        generatedImages: [],
        generation: {
          status: 'idle',
          total: 0,
          completed: 0,
          preset: visualDirection,
        },
      })
      createdProjectId = project.id

      const enqueueRes = await fetch(`/api/projects/${project.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'initial',
          shotTypes: allowedShotTypes,
          preset: visualDirection,
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

      await updateProject(project.id, {
        generation: {
          status: 'generating',
          total: allowedShotTypes.length,
          completed: 0,
          nextType: allowedShotTypes[0],
          shotTypes: allowedShotTypes,
          preset: visualDirection,
        },
      }).catch(() => {})

      router.push(`/dashboard/results/${project.id}`)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to generate. Please try again.'
      const status =
        typeof e === 'object' && e !== null && 'status' in e ? (e as { status?: unknown }).status : undefined
      const isAuth = status === 401 || /logged in|unauthorized/i.test(message)
      toast({
        title: isAuth ? 'Login required' : 'Generation failed',
        description: isAuth
          ? 'You must log in to generate content.'
          : message,
        variant: 'destructive',
      })
      if (isAuth) {
        router.push(`/login?callbackUrl=${encodeURIComponent('/dashboard/generate')}`)
      } else if (createdProjectId) {
        deleteProject(createdProjectId)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const AnimatedHeadingWord = ({
    variant,
    animate = true,
  }: {
    variant: NonTypingHeadingAnimVariantKey
    animate?: boolean
  }) => {
    const v = HEADING_ANIM_VARIANTS[variant]
    const shouldAnimate = animate && isHeadingWordRolling

    return (
      <span
        className="relative inline-block overflow-hidden align-middle text-red-500"
        style={{ height: '1.12em', minWidth: `${HEADING_WORD_WIDTH_CHARS}ch` }}
      >
        {/* Keeps width stable while animated words are absolutely positioned. */}
        <span className="invisible whitespace-nowrap leading-none">{HEADING_WORD_WIDTH_ANCHOR}</span>

        <span className={cn('absolute left-0 top-0 block w-full whitespace-nowrap heading-cuboid-word', shouldAnimate ? v.out : v.visible)}>
          {HEADING_WORDS[headingWordIndex]}
        </span>

        <span
          className={cn('absolute left-0 top-0 block w-full whitespace-nowrap heading-cuboid-word', shouldAnimate ? v.in : v.hidden)}
          aria-hidden={!shouldAnimate}
        >
          {HEADING_WORDS[nextHeadingWordIndex]}
        </span>
      </span>
    )
  }

  return (
    <div className="px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10">
          <h1 className="whitespace-nowrap text-3xl sm:text-5xl font-semibold tracking-tight leading-none">
            Creating{' '}
            {activeHeadingAnimVariant === 'typing' ? (
              <span
                className="inline-block text-red-500"
                style={{
                  height: '1.12em',
                  minWidth: `${HEADING_WORD_WIDTH_CHARS}ch`,
                }}
              >
                {HEADING_WORDS[headingWordIndex].slice(0, typingCharCount)}
                <span className="ml-1 inline-block w-[2px] align-middle bg-red-500 animate-pulse" aria-hidden />
              </span>
            ) : (
              <AnimatedHeadingWord variant={activeHeadingAnimVariant as NonTypingHeadingAnimVariantKey} />
            )}
          </h1>
          <p className="mt-4 max-w-2xl text-sm sm:text-base text-muted-foreground leading-relaxed">
            Transform your concepts into studio-grade visuals with precision lighting and composition control.
          </p>

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
          {/* Left: Upload + generation options */}
          <section className="space-y-6">
            <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground ml-4">
              Product type
            </div>
            <div className="mt-0">
              <Select
                value={productType}
                onValueChange={(v) => setProductType(v as typeof productType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Auto-detect" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-detect</SelectItem>
                  <SelectItem value="hoodie">Hoodie</SelectItem>
                  <SelectItem value="tshirt">T-Shirt</SelectItem>
                  <SelectItem value="jacket">Jacket</SelectItem>
                  <SelectItem value="sweatshirt">Sweatshirt</SelectItem>
                  <SelectItem value="pants">Pants</SelectItem>
                  <SelectItem value="custom">Other (type)</SelectItem>
                </SelectContent>
              </Select>

              {productType === 'custom' ? (
                <div className="mt-3">
                  <Input
                    value={customProductType}
                    onChange={(e) => setCustomProductType(e.target.value)}
                    placeholder="e.g., jumpsuit, robe, hoodie with zipper…"
                  />
                </div>
              ) : null}
            </div>

            <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground ml-4">
              Product image
            </div>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                'rounded-xl border border-white/10 bg-card/40 shadow-sm transition-colors',
                isDragging ? 'border-accent/80' : 'hover:border-white/20'
              )}
            >
              <input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
                id="file-input"
              />

              <label htmlFor="file-input" className="block cursor-pointer p-6 sm:p-8">
                <div
                  className={cn(
                    'rounded-lg border border-dashed p-6 sm:p-8',
                    isDragging ? 'border-accent/80' : 'border-white/15'
                  )}
                >
                  <div className="grid place-items-center">
                    {preview ? (
                      <div className="w-full max-w-[360px]">
                        <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-md bg-secondary/60 border border-white/10">
                          <Image
                            src={preview}
                            alt="Uploaded design preview"
                            fill
                            className="object-contain"
                            sizes="(min-width: 1024px) 420px, 100vw"
                          />
                        </div>
                        <p className="mt-4 text-center text-xs text-muted-foreground">
                          Click or drop to replace
                        </p>
                        {file?.name && (
                          <p className="mt-2 text-center text-xs text-muted-foreground truncate">
                            {file.name}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="w-full max-w-[360px]">
                        <div className="mx-auto grid place-items-center">
                          <div className="mb-5 grid h-14 w-14 place-items-center rounded-md border border-white/10 text-muted-foreground">
                            <Upload className="h-6 w-6" />
                          </div>
                          <p className="text-center text-sm font-medium text-foreground">
                            Upload your design
                          </p>
                          <p className="mt-2 text-center text-xs text-muted-foreground">
                            Drag and drop your high-res PNG or TIFF files here to begin the process.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </label>
            </div>

            <div className="hidden lg:block mt-2">
              <Button
                onClick={handleGenerate}
                disabled={!canGenerateNow}
                className={cn(
                  'w-full rounded-full py-6 text-sm tracking-[0.35em] uppercase cursor-pointer disabled:cursor-not-allowed',
                  'bg-transparent border border-white/15 hover:border-white/25 hover:bg-accent/5'
                )}
                variant="outline"
              >
                {isLoading ? 'Generating…' : 'Generate Content'}
              </Button>
              {!hasEnoughCredits ? (
                <p className="mt-3 text-xs text-destructive">Not enough credits for selected assets.</p>
              ) : null}
              {selectedAllowedCount === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Your current plan does not allow the selected shot types.
                </p>
              ) : null}
            </div>
          </section>

          {/* Right: Direction + shot types + CTA */}
          <aside className="rounded-t-none rounded-b-2xl border border-white/10 border-t-0 bg-card/40 shadow-sm">
            <div className="border-t border-white/10 px-6 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-6">
              {isAuthed ? (
                <div className="mb-6 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Credits Remaining</p>
                  <p className="mt-1 text-lg font-bold leading-none">
                    {creditsRemaining == null
                      ? '...'
                      : creditsLimit != null && creditsLimit < 0
                        ? 'Unlimited'
                        : creditsRemaining}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
                    {selectedAllowedCount} credit{selectedAllowedCount === 1 ? '' : 's'} needed
                  </p>
                  {creditsSyncing ? (
                    <p className="text-[10px] text-muted-foreground mt-1">Syncing latest usage...</p>
                  ) : null}
                </div>
              ) : null}

              <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">
                Shot types
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {sortedShotTypes.map((t) => {
                  const selected = shotTypes.has(t.key)
                  const enabled = availableShotTypes.some((s) => s.key === t.key)
                  return (
                    <button
                      key={t.key}
                      type="button"
                      disabled={!enabled}
                      onClick={() => {
                        if (!enabled) return
                        setShotTypes((prev) => {
                          const next = new Set(prev)
                          if (next.has(t.key)) {
                            if (next.size === 1) return next
                            next.delete(t.key)
                          }
                          else {
                            if (t.key.startsWith('flatlay_')) {
                              const existingFlatlays = Array.from(next).filter((k) => k.startsWith('flatlay_'))
                              if (existingFlatlays.length >= limits.flatLayTypes) return next
                            }
                            next.add(t.key)
                          }
                          return next
                        })
                      }}
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-xs transition-colors cursor-pointer',
                        !enabled && 'opacity-40 cursor-not-allowed',
                        selected
                          ? 'border-accent/80 bg-accent/10 text-accent'
                          : 'border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground hover:bg-accent/5'
                      )}
                      aria-pressed={selected}
                    >
                      {t.label}
                      {!enabled ? ' (Upgrade)' : ''}
                    </button>
                  )
                })}
              </div>

              <div className="my-7 h-px w-full bg-white/10" />

              <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">
                Visual direction
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                {VISUAL_DIRECTIONS.map((d) => {
                  const selected = visualDirection === d.key
                  const presetEnabled = limits.presets.includes(d.key)
                  const swatchClassName = d.key === 'surprise' ? surpriseSwatchClassName : d.swatchClassName
                  return (
                    <button
                      key={d.key}
                      type="button"
                      disabled={!presetEnabled}
                      onClick={() => {
                        if (!presetEnabled) return
                        setVisualDirection(d.key)
                      }}
                      className={cn(
                        'group rounded-lg border bg-background/20 p-4 text-left transition-colors cursor-pointer',
                        !presetEnabled && 'opacity-40 cursor-not-allowed',
                        selected
                          ? 'border-accent/80 ring-1 ring-accent/40'
                          : 'border-white/10 hover:border-white/20'
                      )}
                    >
                      <div className={cn('h-8 w-full rounded-sm', swatchClassName)} />
                      <div className="mt-4 text-sm font-medium text-foreground">{d.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground leading-snug">
                        {d.subtitle}
                      </div>
                      {!presetEnabled ? (
                        <div className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                          Upgrade required
                        </div>
                      ) : null}
                    </button>
                  )
                })}
              </div>

              <div className="mt-10 lg:hidden">
                <Button
                  onClick={handleGenerate}
                  disabled={!canGenerateNow}
                  className={cn(
                    'w-full rounded-full py-6 text-sm tracking-[0.35em] uppercase cursor-pointer disabled:cursor-not-allowed',
                    'bg-transparent border border-white/15 hover:border-white/25 hover:bg-accent/5'
                  )}
                  variant="outline"
                >
                  {isLoading ? 'Generating…' : 'Generate Content'}
                </Button>
                {!hasEnoughCredits ? (
                  <p className="mt-3 text-xs text-destructive">
                    Not enough credits for selected assets.
                  </p>
                ) : null}
                {selectedAllowedCount === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Your current plan does not allow the selected shot types.
                  </p>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useProjects } from '@/hooks/use-projects'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { useRequireAuthForUpload } from '@/hooks/use-require-auth-for-upload'
import { useRole } from '@/hooks/use-role'
import { Input } from '@/components/ui/input'
import { uploadGenerationSourceImageToR2, uploadOriginalImageToR2 } from '@/lib/original-image-upload-client'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { GenerationAspectRatio } from '@/types/projects'

type VisualDirectionKey = 'raw' | 'editorial' | 'luxury' | 'natural' | 'studio' | 'surprise'

const VISUAL_DIRECTIONS: Array<{
  key: VisualDirectionKey
  title: string
  subtitle: string
  swatchClassName: string
}> = [
  {
    key: 'raw',
    title: 'Urban concrete',
    subtitle: 'Aged urban concrete, overcast daylight',
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
  { key: 'flatlay_45deg', label: 'Diagonal overhead flat lay' },
  { key: 'flatlay_sleeves', label: 'Symmetrical sleeve spread' },
  { key: 'flatlay_relaxed', label: 'Relaxed / crumpled flat lay' },
  { key: 'flatlay_folded', label: 'Folded retail shot' },
  { key: 'surface_draped', label: 'Draped over surface' },
  { key: 'surface_hanging', label: 'Hanging shot' },
  { key: 'detail_print', label: 'Print close-up' },
  { key: 'detail_fabric', label: 'Fabric texture macro' },
  { key: 'detail_collar', label: 'Collar / neckline detail' },
]

const HEADING_WORDS = ['Drop', 'Campaign', 'Vision', 'Standard'] as const
const ASPECT_RATIOS: GenerationAspectRatio[] = ['1:1', '4:5', '3:4', '16:9', '9:16']

const SURPRISE_SWATCH_CLASS_OPTIONS = [
  'bg-[linear-gradient(135deg,rgba(14,116,144,0.55),rgba(30,58,138,0.45),rgba(244,244,245,0.06))]',
  'bg-[linear-gradient(135deg,rgba(190,18,60,0.45),rgba(88,28,135,0.45),rgba(244,244,245,0.06))]',
  'bg-[linear-gradient(135deg,rgba(22,101,52,0.50),rgba(5,46,22,0.45),rgba(244,244,245,0.06))]',
  'bg-[linear-gradient(135deg,rgba(180,83,9,0.55),rgba(124,45,18,0.40),rgba(254,243,199,0.08))]',
  'bg-[linear-gradient(135deg,rgba(30,41,59,0.70),rgba(2,6,23,0.65),rgba(226,232,240,0.06))]',
  'bg-[linear-gradient(135deg,rgba(7,89,133,0.50),rgba(17,24,39,0.55),rgba(255,255,255,0.05))]',
] as const

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
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [visualDirection, setVisualDirection] = useState<VisualDirectionKey>('raw')
  const [productType, setProductType] = useState<
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
  >(
    'auto'
  )
  const [customProductType, setCustomProductType] = useState('')
  const [aspectRatio, setAspectRatio] = useState<GenerationAspectRatio>('1:1')
  const [surpriseSwatchClassName, setSurpriseSwatchClassName] = useState<string>(
    SURPRISE_SWATCH_CLASS_OPTIONS[0]
  )
  const [shotTypes, setShotTypes] = useState<Set<ShotTypeKey>>(
    // Start with a low-cost baseline selection; users can add more from Results.
    () => new Set(['flatlay_topdown', 'detail_print'])
  )
  const { addProject, deleteProject, updateProject } = useProjects()
  const router = useRouter()
  const { isAuthed, isAuthLoading, uploadBlocked, ensureAuthForUpload } =
    useRequireAuthForUpload('/dashboard/generate')
  const { role, limits } = useRole()
  const canUseMultiReference = role === 'studio' || role === 'label' || role === 'admin'
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
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null)

  useEffect(() => {
    return () => {
      for (const preview of previews) {
        if (preview.startsWith('blob:')) URL.revokeObjectURL(preview)
      }
    }
  }, [previews])

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
    // Randomize only after mount to avoid SSR/client className mismatches.
    const idx = Math.floor(Math.random() * SURPRISE_SWATCH_CLASS_OPTIONS.length)
    setSurpriseSwatchClassName(SURPRISE_SWATCH_CLASS_OPTIONS[idx] ?? SURPRISE_SWATCH_CLASS_OPTIONS[0])
  }, [])

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
    previews.length > 0 &&
    !isLoading &&
    !isAuthLoading &&
    isAuthed &&
    selectedAllowedCount > 0 &&
    hasEnoughCredits
  const isReferenceSlotsFull = canUseMultiReference && files.length >= 5

  const notifyReferenceLimitReached = () => {
    toast({
      title: 'Reference limit reached',
      description: 'You can upload up to 5 reference images. Remove one to add another.',
    })
  }

  const handleFiles = (incomingFiles: File[]) => {
    if (!ensureAuthForUpload()) return
    const imageFiles = incomingFiles.filter((selectedFile) => selectedFile.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      toast({
        title: 'Unsupported file',
        description: 'Please select an image file.',
        variant: 'destructive',
      })
      return
    }
    const nextFiles = canUseMultiReference ? imageFiles.slice(0, 5) : imageFiles.slice(0, 1)
    const nextPreviews = nextFiles.map((selectedFile) => URL.createObjectURL(selectedFile))
    for (const preview of previews) {
      if (preview.startsWith('blob:')) URL.revokeObjectURL(preview)
    }
    setFiles(nextFiles)
    setPreviews(nextPreviews)
    setActiveSlotIndex(null)
  }

  const appendFiles = (incomingFiles: File[]) => {
    if (!ensureAuthForUpload()) return
    const imageFiles = incomingFiles.filter((selectedFile) => selectedFile.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      toast({
        title: 'Unsupported file',
        description: 'Please select an image file.',
        variant: 'destructive',
      })
      return
    }

    if (!canUseMultiReference) {
      handleFiles(imageFiles)
      return
    }

    const availableSlots = Math.max(0, 5 - files.length)
    if (availableSlots === 0) {
      notifyReferenceLimitReached()
      return
    }

    const filesToAdd = imageFiles.slice(0, availableSlots)
    const previewsToAdd = filesToAdd.map((selectedFile) => URL.createObjectURL(selectedFile))
    setFiles((prev) => [...prev, ...filesToAdd].slice(0, 5))
    setPreviews((prev) => [...prev, ...previewsToAdd].slice(0, 5))
    setActiveSlotIndex(null)
  }

  const handleSelectSlot = (slotIndex: number) => {
    if (!ensureAuthForUpload()) return
    setActiveSlotIndex(slotIndex)
    fileInputRef.current?.click()
  }

  const handleRemoveSlot = (slotIndex: number) => {
    const existingPreview = previews[slotIndex]
    if (existingPreview?.startsWith('blob:')) URL.revokeObjectURL(existingPreview)
    const nextFiles = files.filter((_, idx) => idx !== slotIndex)
    const nextPreviews = previews.filter((_, idx) => idx !== slotIndex)
    setFiles(nextFiles)
    setPreviews(nextPreviews)
  }

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files ? Array.from(event.target.files) : []
    if (selectedFiles.length === 0) return
    if (!ensureAuthForUpload()) {
      event.target.value = ''
      return
    }

    if (activeSlotIndex != null && canUseMultiReference) {
      const selectedFile = selectedFiles[0]
      if (!selectedFile || !selectedFile.type.startsWith('image/')) {
        toast({
          title: 'Unsupported file',
          description: 'Please select an image file.',
          variant: 'destructive',
        })
        return
      }
      const nextFiles = [...files]
      const nextPreviews = [...previews]
      const existingPreview = nextPreviews[activeSlotIndex]
      if (existingPreview?.startsWith('blob:')) URL.revokeObjectURL(existingPreview)
      nextFiles[activeSlotIndex] = selectedFile
      nextPreviews[activeSlotIndex] = URL.createObjectURL(selectedFile)
      setFiles(nextFiles.slice(0, 5))
      setPreviews(nextPreviews.slice(0, 5))
      setActiveSlotIndex(null)
    } else {
      if (canUseMultiReference && files.length > 0) {
        appendFiles(selectedFiles)
      } else {
        handleFiles(selectedFiles)
      }
    }
    event.target.value = ''
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (uploadBlocked) return
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      if (canUseMultiReference && files.length > 0) {
        appendFiles(Array.from(e.dataTransfer.files))
      } else {
        handleFiles(Array.from(e.dataTransfer.files))
      }
    }
  }

  const handleGenerate = async () => {
    if (files.length === 0 || previews.length === 0) return

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
          : productType === 'other'
            ? customProductType.trim() || undefined
            : productType

      const primaryFile = files[0]
      if (!primaryFile) return
      const originalImageUrl = await uploadOriginalImageToR2(primaryFile)
      const sourceImageUrls = await Promise.all(
        files.map(async (sourceFile) => uploadGenerationSourceImageToR2(sourceFile))
      )
      const sourceImageUrl = sourceImageUrls[0]

      const project = await addProject({
        name: primaryFile.name.replace(/\.[^/.]+$/, ''),
        originalImage: originalImageUrl,
        originalImageName: primaryFile.name,
        generatedImages: [],
        generation: {
          status: 'idle',
          total: 0,
          completed: 0,
          preset: visualDirection,
          pipeline: 'garment_photo',
          sourceImageUrl,
          sourceImageUrls: canUseMultiReference ? sourceImageUrls : [sourceImageUrl],
          aspectRatio,
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
          pipeline: 'garment_photo',
          aspectRatio,
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
          pipeline: 'garment_photo',
          aspectRatio,
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
        <div className="mb-10 max-w-2xl">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl">
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
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Transform your concepts into studio-grade visuals with precision lighting and composition control.
          </p>

          {!isAuthLoading && !isAuthed && (
            <div className="mt-6 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
              <span className="font-medium text-red-500 [text-shadow:0_0_10px_rgba(239,68,68,0.75)]">
                Sign in required.
              </span>{' '}
              Sign in to upload images and generate content.
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-8">
          {/* Left: Upload + generation options */}
          <section className="space-y-6 rounded-2xl border border-border/60 bg-[#0a0a0a] p-4 sm:p-5">
            <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground ml-4">
              Product image
            </div>
            {canUseMultiReference ? (
              <div className="mx-1 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-muted-foreground">
                Multi-reference mode: up to 5 inputs
              </div>
            ) : null}

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
              aria-label="Select design file"
              onClick={() => {
                if (!ensureAuthForUpload()) return
                if (isReferenceSlotsFull) {
                  notifyReferenceLimitReached()
                  return
                }
                setActiveSlotIndex(null)
                fileInputRef.current?.click()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  if (!ensureAuthForUpload()) return
                  if (isReferenceSlotsFull) {
                    notifyReferenceLimitReached()
                    return
                  }
                  fileInputRef.current?.click()
                }
              }}
              className={cn(
                'group rounded-xl border border-white/15 bg-card/50 p-5 sm:p-6 shadow-sm transition-all',
                uploadBlocked && 'opacity-75',
                isDragging
                  ? 'border-accent/80 bg-accent/5 shadow-[0_0_0_1px_rgba(248,113,113,0.35)]'
                  : 'hover:border-red-500/50 hover:shadow-[0_0_18px_rgba(239,68,68,0.2)] hover:bg-red-500/5'
              )}
            >
              <input
                type="file"
                accept="image/*"
                multiple={canUseMultiReference}
                onChange={handleFileInputChange}
                className="hidden"
                id="file-input"
                ref={fileInputRef}
                disabled={uploadBlocked}
              />

              <div className="block cursor-pointer">
                <div className="grid place-items-center">
                  {canUseMultiReference ? (
                    <div className="w-full max-w-[560px]">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {Array.from({ length: 5 }).map((_, idx) => {
                          const previewUrl = previews[idx]
                          const fileName = files[idx]?.name
                          const hasImage = Boolean(previewUrl)
                          return (
                            <div
                              key={`slot-${idx}`}
                              className={cn(
                                'rounded-xl p-2 transition-all',
                                hasImage
                                  ? 'border border-white/15 bg-secondary/70 shadow-sm'
                                  : 'border border-dashed border-white/25 bg-white/[0.02] hover:border-red-400/40'
                              )}
                            >
                              <div className="relative aspect-square overflow-hidden rounded-lg bg-black/20">
                                {hasImage ? (
                                  <>
                                    <img
                                      src={previewUrl}
                                      alt={`Uploaded reference ${idx + 1}`}
                                      className="h-full w-full object-contain"
                                    />
                                    {idx === 0 ? (
                                      <span className="absolute left-1.5 top-1.5 rounded-md bg-emerald-500/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white shadow-sm">
                                        Primary
                                      </span>
                                    ) : null}
                                    <button
                                      type="button"
                                      aria-label={`Remove image ${idx + 1}`}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleRemoveSlot(idx)
                                      }}
                                      className="absolute right-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] text-white hover:bg-black/85"
                                    >
                                      x
                                    </button>
                                  </>
                                ) : (
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleSelectSlot(idx)
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        handleSelectSlot(idx)
                                      }
                                    }}
                                    className="grid h-full w-full place-items-center text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
                                  >
                                    + Add image
                                  </div>
                                )}
                              </div>
                              <p className="mt-2 truncate px-0.5 text-[10px] text-muted-foreground">
                                {hasImage ? (fileName ?? `Image ${idx + 1}`) : `Slot ${idx + 1}`}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                      <p className="mt-3 text-center text-xs text-muted-foreground">{previews.length} / 5 selected</p>
                      <p className="mt-1.5 text-center text-xs text-muted-foreground">Drag and drop or click to upload.</p>
                      <p className="mt-1 text-center text-[11px] text-muted-foreground">
                        Left to right order. Slot 1 = primary.
                      </p>
                      <button
                        type="button"
                        className="mt-4 mx-auto block w-auto cursor-pointer rounded-sm border-2 border-red-500 bg-red-500/90 px-5 py-1.5 text-xs font-semibold tracking-wide text-white shadow-[0_0_0_2px_rgba(239,68,68,0.18),0_0_20px_rgba(239,68,68,0.18)] hover:bg-red-500"
                      >
                        Select up to 5 images
                      </button>
                    </div>
                  ) : (
                    <div className="w-full max-w-[360px]">
                      {previews[0] ? (
                        <>
                          <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-md bg-secondary/60 border border-white/15">
                            <img
                              src={previews[0]}
                              alt="Uploaded design preview"
                              className="h-full w-full object-contain"
                            />
                          </div>
                          <p className="mt-4 text-center text-xs text-muted-foreground">Select file or drag and drop to replace</p>
                          {files[0]?.name ? (
                            <p className="mt-2 text-center text-xs text-muted-foreground truncate">{files[0].name}</p>
                          ) : null}
                        </>
                      ) : (
                        <div className="mx-auto grid place-items-center">
                          <div className="mb-5 grid h-14 w-14 place-items-center rounded-md border border-white/15 text-muted-foreground">
                            <Upload className="h-6 w-6" />
                          </div>
                          <p className="text-center text-sm font-medium text-foreground">Upload your design</p>
                          <p className="mt-2 text-center text-xs text-muted-foreground">
                            Drag and drop your high-res PNG or TIFF file here to begin.
                          </p>
                        </div>
                      )}
                      <button
                        type="button"
                        className="mt-5 mx-auto block w-auto cursor-pointer rounded-sm border-2 border-red-500 bg-red-500/90 px-5 py-1.5 text-xs font-semibold tracking-wide text-white shadow-[0_0_0_2px_rgba(239,68,68,0.18),0_0_20px_rgba(239,68,68,0.18)] hover:bg-red-500"
                      >
                        Select File
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="hidden lg:block mt-2">
              <Button
                onClick={handleGenerate}
                disabled={!canGenerateNow}
                className="h-12 w-full rounded-xl text-sm font-semibold tracking-wide disabled:cursor-not-allowed"
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
          <aside className="rounded-t-none rounded-b-2xl border border-white/15 border-t-0 bg-[#0a0a0a] shadow-sm">
            <div className="border-t border-white/15 px-6 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-6">
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
                Product type
              </div>
              <div className="mt-2">
                <Select
                  value={productType}
                  onValueChange={(v) => setProductType(v as typeof productType)}
                >
                  <SelectTrigger className="w-full cursor-pointer">
                    <SelectValue placeholder="Auto-detect" />
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

                {productType === 'other' ? (
                  <div className="mt-2">
                    <Input
                      value={customProductType}
                      onChange={(e) => setCustomProductType(e.target.value)}
                      placeholder="e.g., jumpsuit, robe, hoodie with zipper…"
                    />
                  </div>
                ) : null}
              </div>

              <div className="my-4 h-px w-full bg-white/15" />

              <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">
                Aspect ratio
              </div>
              <div className="mt-2">
                <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as GenerationAspectRatio)}>
                  <SelectTrigger className="w-full cursor-pointer">
                    <SelectValue placeholder="1:1" />
                  </SelectTrigger>
                  <SelectContent>
                    {ASPECT_RATIOS.map((ratio) => (
                      <SelectItem key={ratio} value={ratio}>
                        {ratio}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="my-4 h-px w-full bg-white/15" />

              <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">
                Shot types
              </div>

              <div className="mt-2.5 flex flex-wrap gap-2">
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
                          : 'border-white/15 text-muted-foreground hover:border-white/25 hover:text-foreground hover:bg-accent/5'
                      )}
                      aria-pressed={selected}
                    >
                      {t.label}
                      {!enabled ? ' (Upgrade)' : ''}
                    </button>
                  )
                })}
              </div>

              <div className="my-4 h-px w-full bg-white/15" />

              <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">
                Visual direction
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-3">
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
                          : 'border-white/10',
                        presetEnabled && 'hover:border-red-500/40 hover:bg-red-500/10 hover:shadow-[0_0_16px_rgba(239,68,68,0.18)]'
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
                  className="h-12 w-full rounded-xl text-sm font-semibold tracking-wide disabled:cursor-not-allowed"
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

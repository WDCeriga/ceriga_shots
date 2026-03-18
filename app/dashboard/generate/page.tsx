'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useProjects } from '@/hooks/use-projects'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'

type VisualDirectionKey = 'raw' | 'editorial' | 'luxury' | 'natural' | 'surprise'

const VISUAL_DIRECTIONS: Array<{
  key: VisualDirectionKey
  title: string
  subtitle: string
  swatchClassName: string
}> = [
  { key: 'raw', title: 'Raw', subtitle: 'Dark concrete, hard light', swatchClassName: 'bg-zinc-800' },
  { key: 'editorial', title: 'Editorial', subtitle: 'Slate, diffused, cold', swatchClassName: 'bg-zinc-700/60' },
  { key: 'luxury', title: 'Luxury', subtitle: 'Dark marble, soft overhead', swatchClassName: 'bg-zinc-800/70' },
  { key: 'natural', title: 'Natural', subtitle: 'Aged wood, window light', swatchClassName: 'bg-[linear-gradient(135deg,rgba(161,98,7,0.45),rgba(24,24,27,0.25))]' },
  { key: 'surprise', title: 'Surprise me', subtitle: 'Random, never the same', swatchClassName: 'bg-[linear-gradient(135deg,rgba(255,255,255,0.10),rgba(255,255,255,0.02))]' },
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

export default function GeneratePage() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string>('')
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [visualDirection, setVisualDirection] = useState<VisualDirectionKey>('raw')
  const [shotTypes, setShotTypes] = useState<Set<ShotTypeKey>>(
    () => new Set(['flatlay_topdown', 'flatlay_45deg', 'detail_print', 'flatlay_relaxed'])
  )
  const assetCount = shotTypes.size
  const { addProject } = useProjects()
  const router = useRouter()
  const { status } = useSession()
  const isAuthed = status === 'authenticated'
  const isAuthLoading = status === 'loading'

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

    setIsLoading(true)
    try {
      const project = await addProject({
        name: file.name.replace(/\.[^/.]+$/, ''),
        originalImage: preview,
        originalImageName: file.name,
        generatedImages: [],
        generation: {
          status: 'generating',
          total: assetCount,
          completed: 0,
          shotTypes: Array.from(shotTypes),
          preset: visualDirection,
        },
      })

      router.push(`/dashboard/results/${project.id}`)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to generate. Please try again.'
      const isAuth =
        (e as any)?.status === 401 ||
        /logged in|unauthorized/i.test(message)
      toast({
        title: isAuth ? 'Login required' : 'Generation failed',
        description: isAuth
          ? 'You must log in to generate content.'
          : message,
        variant: 'destructive',
      })
      if (isAuth) {
        router.push(`/login?callbackUrl=${encodeURIComponent('/dashboard/generate')}`)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-7 h-px bg-accent" />
            <span className="text-accent text-xs tracking-[0.35em] uppercase font-medium">
              Start here
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">Upload Your Design</h1>
          <p className="mt-4 max-w-2xl text-sm sm:text-base text-muted-foreground leading-relaxed">
            Drop your front or back design. We handle the rest — flat lays, angles, lifestyle shots,
            and motion content.
          </p>

          {!isAuthLoading && !isAuthed && (
            <div className="mt-6 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
              <span className="font-medium">Login required to generate.</span>{' '}
              You can browse the dashboard, but generation is locked until you sign in.
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-8">
          {/* Left: Upload + asset count */}
          <section className="space-y-6">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-card/30 px-4 py-3">
              <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">
                Number of assets
              </div>
              <div className="text-sm font-medium text-foreground tabular-nums">{assetCount}</div>
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
                            Drag &amp; drop or click to upload
                          </p>
                          <p className="mt-2 text-center text-xs text-muted-foreground">
                            PNG / JPG · Max 20MB
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </label>
            </div>
          </section>

          {/* Right: Direction + shot types + CTA */}
          <aside className="rounded-2xl border border-white/10 bg-card/40 shadow-sm">
            <div className="px-6 pb-6 pt-0 sm:px-8 sm:pb-8 sm:pt-0">
              <div className="text-xs tracking-[0.35em] uppercase text-muted-foreground">
                Shot types
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {SHOT_TYPES.map((t) => {
                  const selected = shotTypes.has(t.key)
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => {
                        setShotTypes((prev) => {
                          const next = new Set(prev)
                          if (next.has(t.key)) {
                            if (next.size === 1) return next
                            next.delete(t.key)
                          }
                          else next.add(t.key)
                          return next
                        })
                      }}
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-xs transition-colors',
                        selected
                          ? 'border-accent/80 bg-accent/10 text-accent'
                          : 'border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground hover:bg-accent/5'
                      )}
                      aria-pressed={selected}
                    >
                      {t.label}
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
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => setVisualDirection(d.key)}
                      className={cn(
                        'group rounded-lg border bg-background/20 p-4 text-left transition-colors',
                        selected
                          ? 'border-accent/80 ring-1 ring-accent/40'
                          : 'border-white/10 hover:border-white/20'
                      )}
                    >
                      <div className={cn('h-8 w-full rounded-sm', d.swatchClassName)} />
                      <div className="mt-4 text-sm font-medium text-foreground">{d.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground leading-snug">
                        {d.subtitle}
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="mt-10">
                <Button
                  onClick={handleGenerate}
                  disabled={!preview || isLoading || isAuthLoading || !isAuthed}
                  className={cn(
                    'w-full rounded-full py-6 text-sm tracking-[0.35em] uppercase',
                    'bg-transparent border border-white/15 hover:border-white/25 hover:bg-accent/5'
                  )}
                  variant="outline"
                >
                  {isLoading ? 'Generating…' : 'Generate Content'}
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

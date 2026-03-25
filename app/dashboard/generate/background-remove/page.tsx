'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Download, ImageIcon, Loader2, RotateCcw, Sparkles, Upload } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  preloadBackgroundRemovalAssets,
  removeBackgroundToDataUrl,
  type BackgroundRemoveOutputMode,
} from '@/lib/background-remove-client'

const CHECKER_BG =
  'repeating-conic-gradient(from 0deg, oklch(0.22 0.01 280) 0% 25%, oklch(0.28 0.01 280) 0% 50%) 50% / 14px 14px'

export default function BackgroundRemovePage() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string>('')
  const [resultDataUrl, setResultDataUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [bgRemoveOutput, setBgRemoveOutput] = useState<BackgroundRemoveOutputMode>('transparent')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const preloadStartedRef = useRef(false)

  useEffect(() => {
    if (preloadStartedRef.current) return
    preloadStartedRef.current = true
    void preloadBackgroundRemovalAssets().catch(() => {})
  }, [])

  useEffect(() => {
    setResultDataUrl(null)
  }, [bgRemoveOutput])

  const canRun = !!file && !!preview && !isLoading
  const hasResult = Boolean(resultDataUrl)

  const handleFile = (selectedFile: File) => {
    if (!selectedFile.type.startsWith('image/')) {
      toast({
        title: 'Unsupported file',
        description: 'Please choose an image (PNG, JPG, or WebP).',
        variant: 'destructive',
      })
      return
    }
    setFile(selectedFile)
    setResultDataUrl(null)
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

  const handleRemoveBackground = async () => {
    if (!file || !preview) return

    setIsLoading(true)
    setResultDataUrl(null)
    try {
      const dataUrl = await removeBackgroundToDataUrl(file, bgRemoveOutput)
      setResultDataUrl(dataUrl)
      toast({
        title: 'Background removed',
        description: 'Your cutout is ready. Download a PNG or adjust output and run again.',
      })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Something went wrong. Try another image or a smaller file.'
      toast({
        title: 'Could not remove background',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownload = () => {
    if (!resultDataUrl || !file) return
    const base = file.name.replace(/\.[^/.]+$/, '') || 'cutout'
    const a = document.createElement('a')
    a.href = resultDataUrl
    a.download = `${base}-no-background.png`
    a.rel = 'noopener'
    a.click()
  }

  const handleReset = () => {
    setFile(null)
    setPreview('')
    setResultDataUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="px-4 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header */}
        <div className="max-w-2xl space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-5xl">
            Background remover
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            Drop a product photo, pick transparent or white output, and get a PNG instantly. Processing stays on your
            device — nothing is sent to our servers until you use other tools.
          </p>
        </div>

        {/* Main grid: source | result */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-stretch lg:gap-8">
          {/* Source + controls */}
          <section className="flex flex-col rounded-2xl border border-white/10 bg-card/40 shadow-sm backdrop-blur-sm">
            <div className="border-b border-white/10 px-5 py-4 sm:px-6">
              <h2 className="text-sm font-semibold tracking-tight">Source image</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Clear subject edges work best.</p>
            </div>

            <div className="flex flex-1 flex-col gap-6 p-5 sm:p-6">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                role="button"
                tabIndex={0}
                aria-label="Upload product image"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
                }}
                className={cn(
                  'group cursor-pointer rounded-xl border-2 border-dashed transition-all',
                  isDragging
                    ? 'border-red-400/70 bg-red-500/10'
                    : 'border-white/15 bg-background/30 hover:border-red-500/45 hover:bg-red-500/[0.06]'
                )}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  className="hidden"
                  id="bg-remove-file-input"
                  ref={fileInputRef}
                />
                <div className="p-6 sm:p-8">
                  {preview ? (
                    <div className="mx-auto w-full max-w-sm">
                      <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-lg border border-white/10 bg-secondary/30">
                        <Image
                          src={preview}
                          alt="Source preview"
                          fill
                          className="object-contain"
                          sizes="(min-width: 1024px) 320px, 100vw"
                          unoptimized
                        />
                      </div>
                      <p className="mt-3 text-center text-xs text-muted-foreground truncate px-2">{file?.name}</p>
                      <p className="mt-1 text-center text-[11px] text-muted-foreground/80">Click or drop to replace</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-background/50 text-muted-foreground">
                        <Upload className="h-6 w-6" />
                      </div>
                      <p className="text-sm font-medium text-foreground">Drop an image here</p>
                      <p className="mt-1 max-w-xs text-xs text-muted-foreground">or click to browse — PNG, JPG, WebP</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setBgRemoveOutput('transparent')}
                  className={cn(
                    'rounded-xl border px-4 py-3.5 text-left transition-all',
                    bgRemoveOutput === 'transparent'
                      ? 'border-red-500/50 bg-red-500/10 ring-1 ring-red-500/30'
                      : 'border-white/10 hover:border-white/20 hover:bg-white/[0.03]'
                  )}
                >
                  <div className="text-sm font-medium">Transparent</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">Alpha channel for overlays</div>
                </button>
                <button
                  type="button"
                  onClick={() => setBgRemoveOutput('white')}
                  className={cn(
                    'rounded-xl border px-4 py-3.5 text-left transition-all',
                    bgRemoveOutput === 'white'
                      ? 'border-red-500/50 bg-red-500/10 ring-1 ring-red-500/30'
                      : 'border-white/10 hover:border-white/20 hover:bg-white/[0.03]'
                  )}
                >
                  <div className="text-sm font-medium">White backdrop</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">Catalog-style solid white</div>
                </button>
              </div>

              <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button
                  onClick={handleRemoveBackground}
                  disabled={!canRun}
                  className="h-12 flex-1 rounded-xl text-sm font-semibold tracking-wide sm:min-w-[200px]"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4 opacity-90" />
                      Remove background
                    </>
                  )}
                </Button>
                {(preview || hasResult) && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleReset}
                    disabled={isLoading}
                    className="h-12 rounded-xl border-white/15 bg-transparent"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Start over
                  </Button>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                First run may download models (~80MB). Runs faster afterward. For huge images, try resizing before upload.
              </p>
            </div>
          </section>

          {/* Result */}
          <section className="flex min-h-[min(520px,70vh)] flex-col rounded-2xl border border-white/10 bg-card/40 shadow-sm backdrop-blur-sm lg:min-h-[560px]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">Result</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Preview updates here — no project created.</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!hasResult}
                onClick={handleDownload}
                className="rounded-lg"
              >
                <Download className="mr-2 h-4 w-4" />
                Download PNG
              </Button>
            </div>

            <div
              className="relative flex flex-1 flex-col items-center justify-center p-5 sm:p-8"
              style={{
                background: bgRemoveOutput === 'white' ? '#f4f4f5' : undefined,
                backgroundImage: bgRemoveOutput === 'transparent' ? CHECKER_BG : undefined,
              }}
            >
              {isLoading ? (
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-background/60">
                    <Loader2 className="h-8 w-8 animate-spin text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Removing background…</p>
                    <p className="mt-1 max-w-xs text-xs text-muted-foreground">This can take a few seconds on first use.</p>
                  </div>
                </div>
              ) : hasResult && resultDataUrl ? (
                <img
                  src={resultDataUrl}
                  alt="Background removed"
                  className="max-h-[min(52vh,480px)] w-auto max-w-full rounded-lg object-contain shadow-lg ring-1 ring-black/10 dark:ring-white/10"
                />
              ) : (
                <div className="flex max-w-xs flex-col items-center text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-background/20 text-muted-foreground">
                    <ImageIcon className="h-7 w-7 opacity-60" />
                  </div>
                  <p className="text-sm font-medium text-foreground/90">No result yet</p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Upload a photo and choose <span className="text-foreground/80">Remove background</span>. Your cutout
                    appears here with a checkerboard (transparent) or white preview.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

'use client'

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export function LightboxAsset({
  title,
  prompt,
  children,
}: {
  title: string
  prompt?: string
  children: React.ReactNode
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="block w-full text-left" aria-label={`Open ${title}`}>
          {children}
        </button>
      </DialogTrigger>

      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[min(1100px,calc(100vw-1rem))] flex-col overflow-hidden p-0 sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:max-w-[min(1100px,calc(100vw-2rem))]">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="px-4 py-3 border-b border-border text-sm text-muted-foreground">
          {title}
        </div>
        <div className="overflow-y-auto p-4">
          {prompt ? (
            <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-secondary/30 p-3 text-xs leading-relaxed">
              {prompt}
            </pre>
          ) : (
            <div className="text-sm text-muted-foreground">
              No image is available yet, and no prompt was saved for this asset.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function LightboxImage({
  src,
  alt,
  title,
  imgClassName,
  buttonClassName,
}: {
  src: string
  alt: string
  title?: string
  prompt?: string
  imgClassName?: string
  buttonClassName?: string
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn('block w-full text-left', buttonClassName)}
          aria-label={title ? `Open ${title}` : 'Open image'}
        >
          <img src={src} alt={alt} className={imgClassName} loading="lazy" />
        </button>
      </DialogTrigger>

      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[min(1100px,calc(100vw-1rem))] flex-col overflow-hidden p-0 sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:max-w-[min(1100px,calc(100vw-2rem))]">
        <DialogTitle className="sr-only">{title ?? alt}</DialogTitle>
        <div className="min-h-0 flex-1 bg-black/40">
          <img
            src={src}
            alt={alt}
            className="block h-auto max-h-[calc(100dvh-8rem)] w-full object-contain sm:max-h-[80vh]"
          />
        </div>
        {title ? (
          <div className="px-4 py-3 border-t border-border text-sm text-muted-foreground">
            {title}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}


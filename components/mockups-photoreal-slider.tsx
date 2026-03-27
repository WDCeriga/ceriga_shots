'use client'

import Image from 'next/image'
import { useCallback, useMemo, useRef, useState } from 'react'

const BEFORE_IMAGE_SRC = '/images/mockups-protoreal-before.jpg'
const AFTER_IMAGE_SRC = '/images/mockups-protoreal-after.jpg'

export function MockupsPhotorealSlider() {
  const [sliderValue, setSliderValue] = useState(52)
  const [isDragging, setIsDragging] = useState(false)
  const sliderSurfaceRef = useRef<HTMLDivElement | null>(null)
  const afterWidth = useMemo(() => `${sliderValue}%`, [sliderValue])
  const sliderHandleLabel = '<>'
  const beforeLabelHidden = sliderValue < 20
  const afterLabelHidden = sliderValue > 80

  const updateFromClientX = useCallback((clientX: number) => {
    const element = sliderSurfaceRef.current
    if (!element) return

    const rect = element.getBoundingClientRect()
    const relativeX = clientX - rect.left
    const nextValue = Math.max(0, Math.min(100, (relativeX / rect.width) * 100))
    setSliderValue(Math.round(nextValue))
  }, [])

  const handleSurfacePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragging(true)
      updateFromClientX(event.clientX)

      const onPointerMove = (moveEvent: PointerEvent) => updateFromClientX(moveEvent.clientX)
      const onPointerUp = () => {
        setIsDragging(false)
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
    },
    [updateFromClientX]
  )

  return (
    <div className="relative h-[420px] overflow-hidden rounded-lg border border-white/10 bg-[#0b0b0f] shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_24px_80px_rgba(0,0,0,0.45)]">
      <div
        className={`pointer-events-none absolute left-4 top-4 z-20 rounded bg-background/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground backdrop-blur transition-opacity duration-200 ${
          beforeLabelHidden ? 'opacity-0' : 'opacity-100'
        }`}
      >
        PhotoReal
      </div>
      <div
        className={`pointer-events-none absolute right-4 top-4 z-20 rounded bg-accent px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-foreground transition-opacity duration-200 ${
          afterLabelHidden ? 'opacity-0' : 'opacity-100'
        }`}
      >
        Mockup
      </div>

      <div
        ref={sliderSurfaceRef}
        onPointerDown={handleSurfacePointerDown}
        className={`relative h-[calc(100%-56px)] w-full touch-none ${isDragging ? 'cursor-ew-resize' : 'cursor-ew-resize'}`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#262933_0%,#14151b_45%,#0b0b0f_100%)]" />
        <div className="absolute inset-0">
          <RawMockVisual />
        </div>

        <div
          className="absolute inset-0"
          style={{
            clipPath: `inset(0 ${100 - sliderValue}% 0 0)`,
          }}
        >
          <GeneratedMockVisual />
        </div>

        <div className="pointer-events-none absolute inset-y-0 z-30" style={{ left: afterWidth }}>
          <div className="relative -ml-px h-full w-0.5 bg-accent shadow-[0_0_0_1px_rgba(255,70,70,0.28),0_0_22px_rgba(255,70,70,0.55)]" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/80 bg-background px-2 py-1 text-xs font-bold text-accent">
            {sliderHandleLabel}
          </div>
        </div>
      </div>

      <div className="px-4 pb-5 pt-4 sm:px-6">
        <input
          type="range"
          min={0}
          max={100}
          value={sliderValue}
          onChange={(event) => setSliderValue(Number(event.target.value))}
          aria-label="Compare mockup and photoreal generated result"
          className="h-2 w-full cursor-ew-resize appearance-none rounded-full bg-white/10 accent-[var(--color-accent)]"
        />
        
      </div>
    </div>
  )
}

function RawMockVisual() {
  return (
    <div className="relative h-full w-full">
      <Image
        src={BEFORE_IMAGE_SRC}
        alt="Mockup before conversion"
        fill
        sizes="(max-width: 1024px) 100vw, 900px"
        className="object-contain object-center"
      />
    </div>
  )
}

function GeneratedMockVisual() {
  return (
    <div className="relative h-full w-full bg-[#0b0b0f]">
      <Image
        src={AFTER_IMAGE_SRC}
        alt="Photoreal image after conversion"
        fill
        sizes="(max-width: 1024px) 100vw, 900px"
        className="object-contain object-center"
      />
    </div>
  )
}

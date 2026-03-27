'use client'

import { useCallback, useMemo, useRef, useState } from 'react'

export function MockupsPhotorealSlider() {
  const [sliderValue, setSliderValue] = useState(58)
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
        Before
      </div>
      <div
        className={`pointer-events-none absolute right-4 top-4 z-20 rounded bg-accent px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-foreground transition-opacity duration-200 ${
          afterLabelHidden ? 'opacity-0' : 'opacity-100'
        }`}
      >
        AI After
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

        <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: afterWidth }}>
          <div className="absolute inset-0 w-[100cqw]">
            <GeneratedMockVisual />
          </div>
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
        <div className="mt-2 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          <span>Digital mockup</span>
          <span>Final render</span>
        </div>
      </div>
    </div>
  )
}

function RawMockVisual() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0 bg-[linear-gradient(160deg,#202532_0%,#161923_48%,#11141b_100%)]" />
      <div className="absolute left-[14%] top-[16%] h-[68%] w-[38%] rounded-xl bg-white/10 blur-[0.6px]" />
      <div className="absolute right-[15%] top-[16%] h-[68%] w-[30%] rounded-xl bg-white/5 blur-[1px]" />
      <div className="absolute bottom-6 left-6 max-w-[65%] rounded border border-white/15 bg-black/30 px-3 py-2 text-xs text-white/70">
        Dim room lighting, no styling, no retouching.
      </div>
    </div>
  )
}

function GeneratedMockVisual() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0 bg-[linear-gradient(160deg,#c9dee4_0%,#d4c5bf_55%,#b8a59c_100%)]" />
      <div className="absolute left-[10%] top-[10%] h-[74%] w-[36%] rounded-xl bg-white/70 shadow-[0_12px_30px_rgba(0,0,0,0.22)]" />
      <div className="absolute right-[14%] top-[12%] h-[72%] w-[31%] rounded-xl bg-[#1d2532] shadow-[0_12px_30px_rgba(0,0,0,0.35)]" />
      <div className="absolute bottom-6 left-6 rounded border border-black/10 bg-white/80 px-3 py-2 text-xs font-medium text-[#1c1f26] backdrop-blur">
        Styled, color-corrected, export-ready.
      </div>
    </div>
  )
}

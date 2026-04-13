"use client"

import Image from "next/image"
import Link from "next/link"
import { ArrowRight, MousePointer2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

const visualDirections = [
  { key: "raw", title: "Urban concrete" },
  { key: "studio", title: "Studio" },
] as const

const shotTypes = [
  "Top-down flat lay",
  "Print close-up",
  "Hanging shot",
] as const

const heroStats = [
  { value: "1.2M+", label: "Assets Generated" },
  { value: "850+", label: "Active Brands" },
  { value: "1.4s", label: "Avg. Gen Time" },
  { value: "92%", label: "Cost Reduction" },
] as const

const generatedAssetImageByShotAndDirection: Record<string, Record<"raw" | "studio", string>> = {
  "Top-down flat lay": {
    raw: "/images/demo-generated-topdown-raw.jpg",
    studio: "/images/demo-generated-topdown-studio.jpg",
  },
  "Print close-up": {
    raw: "/images/demo-generated-print-closeup-raw.jpg",
    studio: "/images/demo-generated-print-closeup-studio.jpg",
  },
  "Hanging shot": {
    raw: "/images/demo-generated-hanging-shot-raw.jpg",
    studio: "/images/demo-generated-hanging-shot-studio.jpg",
  },
}

export function HeroSection() {
  const [resultsVisible, setResultsVisible] = useState(false)
  const [selectedDirection, setSelectedDirection] = useState<(typeof visualDirections)[number]["key"]>("studio")
  const [selectedShots, setSelectedShots] = useState<string[]>(["Top-down flat lay"])
  const [generatedShots, setGeneratedShots] = useState<string[]>(["Top-down flat lay"])
  const [generatedDirection, setGeneratedDirection] = useState<"raw" | "studio">("studio")
  const [openResultSrc, setOpenResultSrc] = useState<string | null>(null)
  const [openResultLabel, setOpenResultLabel] = useState<string>("")
  const [scrollShimmer, setScrollShimmer] = useState(false)
  const [showDragCue, setShowDragCue] = useState(false)
  const flowSectionRef = useRef<HTMLDivElement | null>(null)
  const selectedShotsRef = useRef<string[]>(selectedShots)
  const selectedDirectionRef = useRef<"raw" | "studio">(selectedDirection)

  function toggleShot(label: string) {
    setSelectedShots((prev) => {
      if (prev.includes(label)) {
        if (prev.length === 1) return prev
        return prev.filter((item) => item !== label)
      }
      return [...prev, label]
    })
  }

  useEffect(() => {
    selectedShotsRef.current = selectedShots
  }, [selectedShots])

  useEffect(() => {
    selectedDirectionRef.current = selectedDirection
  }, [selectedDirection])

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const onScroll = () => {
      setScrollShimmer(true)
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => setScrollShimmer(false), 220)
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenResultSrc(null)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    let cueTimeout: ReturnType<typeof setTimeout> | null = null
    const target = flowSectionRef.current
    if (!target) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting) return
        setShowDragCue(true)
        if (cueTimeout) clearTimeout(cueTimeout)
        cueTimeout = setTimeout(() => {
          setShowDragCue(false)
          // Once the guidance cursor completes, reveal assets as "just generated".
          setGeneratedShots(selectedShotsRef.current)
          setGeneratedDirection(selectedDirectionRef.current)
          setResultsVisible(true)
        }, 3200)
      },
      { threshold: 0.35 }
    )

    observer.observe(target)
    return () => {
      observer.disconnect()
      if (cueTimeout) clearTimeout(cueTimeout)
    }
  }, [])

  return (
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden pt-16">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.1]"
        style={{
          backgroundImage: `linear-gradient(var(--color-foreground) 1px, transparent 1px), linear-gradient(90deg, var(--color-foreground) 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-12 py-24 w-full">
        {/* Tag line */}
        <div className="animate-fade-up flex items-center gap-3 mb-10">
          <span className="w-6 h-px bg-accent" />
          <span className="text-accent text-xs tracking-[0.3em] uppercase font-medium">AI-Powered Content Studio</span>
        </div>

        {/* Headline */}
        <h1 className="animate-fade-up animation-delay-100 text-5xl sm:text-7xl lg:text-8xl font-black leading-[0.92] tracking-tight text-foreground text-balance mb-8 max-w-4xl">
          One product
          <br />
          image.{" "}
          <span className="text-accent italic font-black">Infinite</span>
          <br />
          content.
        </h1>

        {/* Subtext */}
        <p className="animate-fade-up animation-delay-200 text-muted-foreground text-lg leading-relaxed max-w-xl mb-12">
          Upload your design and instantly generate AI flat lays, product shots,
          and short fashion videos for clothing brands. No photoshoots. No
          editing. No effort.
        </p>

        {/* CTAs */}
        <div className="animate-fade-up animation-delay-300 flex flex-col sm:flex-row gap-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 bg-foreground text-background text-sm font-semibold tracking-wider uppercase px-8 py-4 hover:bg-accent hover:text-foreground transition-all duration-300 group"
          >
            Upload Design
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            href="#gallery"
            className="inline-flex items-center justify-center gap-2 border border-border text-foreground text-sm font-medium tracking-wider uppercase px-8 py-4 hover:border-foreground transition-all duration-300"
          >
            See Examples
          </Link>
        </div>

        <div className="animate-fade-up animation-delay-400 mt-30 border-y border-border/80 py-10">
          <div className="grid grid-cols-2 gap-y-8 sm:grid-cols-4 lg:grid-cols-4 lg:gap-x-6">
            {heroStats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-5xl font-black tracking-tight text-accent sm:text-5.5xl">{stat.value}</div>
                <p className="mt-2 text-[10px] uppercase tracking-[0.35em] text-muted-foreground/90">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="animate-fade-up animation-delay-500 mt-28 border-t border-border/70 pt-8 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-accent">Interactive Experience</p>
          <h2 className="mt-2 text-4xl font-black tracking-tight text-foreground sm:text-6xl">Try the Studio</h2>
        </div>

        {/* Generate flow visual */}
        <div ref={flowSectionRef} className="animate-fade-up animation-delay-500 mt-12 relative">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_12%_10%,rgba(239,68,68,0.16),transparent_35%),radial-gradient(circle_at_82%_78%,rgba(239,68,68,0.10),transparent_40%)]" />
          {showDragCue ? (
            <span className="pointer-events-none hidden lg:inline-flex absolute left-[10%] top-[10%] z-20 h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-accent text-white shadow-[0_10px_24px_rgba(239,68,68,0.45)] animate-flow-cue-route">
              <MousePointer2 className="h-5 w-5 rotate-12" />
            </span>
          ) : null}
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.25fr] lg:items-start">
            <div className="relative">
              <div className="absolute -inset-3 rounded-2xl bg-white/[0.02] blur-xl" />
              <div className="relative rounded-2xl border border-white/10 bg-[#0e121b] p-4">
                <div className="relative mx-auto max-w-[22rem] overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(165deg,#1f2430_0%,#101522_100%)]">
                  <div className="absolute left-3 top-3 z-10 rounded bg-black/35 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/80">
                    Source
                  </div>
                  <Image
                    src="/images/demo-initial-hoodie.jpg"
                    alt="Initial uploaded product image"
                    width={420}
                    height={420}
                    className="w-full h-auto opacity-95"
                    priority
                  />
                </div>
                <div className="mt-3 text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Initial image
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0d1118] p-4">
              <div className="mt-3 grid gap-3">
                <div className="rounded-xl border border-white/10 bg-[#0d1118] px-5 py-4">
                  <div className="text-sm text-muted-foreground">1. Visual direction</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {visualDirections.map((direction) => (
                      <button
                        key={direction.key}
                        type="button"
                        onClick={() => setSelectedDirection(direction.key)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          selectedDirection === direction.key
                            ? "bg-accent text-accent-foreground"
                            : "border border-white/15 text-foreground/80 hover:bg-white/5"
                        }`}
                      >
                        {direction.title}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#0d1118] px-5 py-4">
                  <div className="text-sm text-muted-foreground">2. Shot types</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {shotTypes.map((shot) => (
                      <button
                        key={shot}
                        type="button"
                        onClick={() => toggleShot(shot)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          selectedShots.includes(shot)
                            ? "bg-accent text-accent-foreground border border-accent/70"
                            : "border border-white/15 text-foreground/80 hover:bg-white/5"
                        }`}
                      >
                        {shot}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setGeneratedShots(selectedShots)
                    setGeneratedDirection(selectedDirection)
                    setResultsVisible(true)
                  }}
                  className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-accent px-6 py-3 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
                >
                  <span
                    className={`pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_20%,rgba(255,255,255,0.28)_48%,transparent_74%)] transition-transform duration-700 ${
                      scrollShimmer ? "translate-x-[180%]" : "translate-x-[-160%]"
                    }`}
                  />
                  <span className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-accent/70 animate-pulse [animation-duration:2.2s]" />
                  Generate Assets
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResultsVisible(false)
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-white/15 px-6 py-3 text-base font-medium text-foreground transition-colors hover:bg-white/5"
                >
                  Reset
                </button>
              </div>

              <div className="p-5 sm:pl-1">
                <div className="mb-3 text-foreground text-base font-semibold uppercase tracking-[0.12em]">AI Generated Assets</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {generatedShots.slice(0, 6).map((label, idx) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        const src =
                          generatedAssetImageByShotAndDirection[label]?.[generatedDirection] ??
                          "/images/demo-generated-topdown-studio.jpg"
                        setOpenResultSrc(src)
                        setOpenResultLabel(label)
                      }}
                      className={`relative overflow-hidden rounded-xl border border-white/10 h-34 sm:h-48 transition-all duration-600 ${
                        resultsVisible ? "opacity-100 translate-y-0" : "opacity-20 translate-y-1"
                      }`}
                      style={{ transitionDelay: `${idx * 80}ms` }}
                    >
                      <Image
                        src={
                          generatedAssetImageByShotAndDirection[label]?.[generatedDirection] ??
                          "/images/demo-generated-topdown-studio.jpg"
                        }
                        alt={`Generated ${label}`}
                        fill
                        sizes="(max-width: 640px) 40vw, 22vw"
                        className="object-cover"
                      />
                      <div className="absolute inset-0 bg-black/25" />
                      <div className="flex h-full items-end p-2">
                        <span className="rounded bg-black/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-foreground/80">
                          {label}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {openResultSrc ? (
          <div
            className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setOpenResultSrc(null)}
          >
            <div
              className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-white/15 bg-[#0b0d12]"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setOpenResultSrc(null)}
                className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/20 bg-black/45 text-white hover:bg-black/60"
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="relative aspect-[16/10] w-full">
                <Image src={openResultSrc} alt={openResultLabel || "Generated result"} fill className="object-contain" />
              </div>
            </div>
          </div>
        ) : null}

      </div>
    </section>
  )
}

"use client"

import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

const generatedShots = [
  { src: "/images/hoodie-flatlay.jpg", label: "Flat Lay" },
  { src: "/images/hoodie-angle.jpg", label: "45° Angle" },
  { src: "/images/hoodie-closeup.jpg", label: "Close-up" },
  { src: "/images/hoodie-lifestyle.jpg", label: "Lifestyle" },
]

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden pt-16">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.04]"
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
          Upload your design and instantly generate flat lays, product shots, and
          short videos using AI. No photoshoots. No editing. No effort.
        </p>

        {/* CTAs */}
        <div className="animate-fade-up animation-delay-300 flex flex-col sm:flex-row gap-4">
          <Link
            href="/dashboard/generate"
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

        {/* Before / After visual */}
        <div className="animate-fade-up animation-delay-400 mt-24 grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          {/* Original */}
          <div className="relative group">
            <div className="absolute top-4 left-4 z-10 bg-background/80 backdrop-blur-sm border border-border px-3 py-1.5 text-xs text-white tracking-widest uppercase">
              Original
            </div>
            <div className="overflow-hidden">
              <Image
                src="/images/hoodie-original.jpg"
                alt="Original hoodie product photo"
                width={800}
                height={600}
                className="w-full h-auto group-hover:scale-105 transition-transform duration-700"
                priority
              />
            </div>
          </div>

          {/* Generated grid */}
          <div className="relative">
            <div className="absolute top-4 left-4 z-10 bg-accent/90 backdrop-blur-sm px-3 py-1.5 text-xs text-foreground tracking-widest uppercase font-semibold">
              AI Generated
            </div>
            <div className="grid grid-cols-2 gap-1">
              {generatedShots.map((shot, i) => (
                <div key={shot.label} className="relative overflow-hidden group/card">
                  <Image
                    src={shot.src}
                    alt={`Generated ${shot.label} shot`}
                    width={400}
                    height={300}
                    className="w-full h-auto group-hover/card:scale-110 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-background/0 group-hover/card:bg-background/30 transition-colors duration-300" />
                  <span className="absolute bottom-2 left-2 text-[10px] tracking-widest uppercase text-foreground/70 bg-background/60 backdrop-blur-sm px-2 py-0.5">
                    {shot.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="animate-fade-up animation-delay-500 mt-16 pt-10 border-t border-border grid grid-cols-3 gap-8 max-w-lg">
          {[
            { value: "12+", label: "Output formats" },
            { value: "< 60s", label: "Generation time" },
            { value: "4K", label: "Export quality" },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-3xl font-black text-foreground">{stat.value}</div>
              <div className="text-xs text-muted-foreground tracking-widest uppercase mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

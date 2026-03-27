import type { Metadata } from 'next'
import { Layers, Sparkles, Wand2, ShieldCheck, Download, Clock3, SunMedium, Aperture, Orbit } from 'lucide-react'
import Link from 'next/link'

import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/cta-footer'
import { MockupsPhotorealSlider } from '@/components/mockups-photoreal-slider'

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Explore Ceriga Shots features: visual directions, shot controls, export tooling, consistency safeguards, and rapid generation for ecommerce teams.',
}

const features = [
  {
    title: 'Visual Direction Presets',
    description: 'Choose from Urban concrete, Studio, Editorial, Luxury, Natural, or Surprise me for instant scene styling.',
    Icon: Sparkles,
  },
  {
    title: 'Shot Type Control',
    description: 'Generate top-down flat lays, detail macros, draped surfaces, and hanging views from a single source.',
    Icon: Layers,
  },
  {
    title: 'Prompted Refinement',
    description: 'Refine outputs with targeted edits while preserving design fidelity and print placement.',
    Icon: Wand2,
  },
  {
    title: 'Brand Consistency Guardrails',
    description: 'Production flow is optimized to keep your silhouette, logos, color intent, and composition coherent.',
    Icon: ShieldCheck,
  },
  {
    title: 'Export-Ready Assets',
    description: 'Download shareable outputs fast for product pages, paid ads, launch posts, and campaign packs.',
    Icon: Download,
  },
  {
    title: 'Fast Turnaround',
    description: 'Most generations complete in under a minute, so teams can iterate quickly without reshoots.',
    Icon: Clock3,
  },
] as const

export default function FeaturesPage() {
  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <section className="border-t border-border pt-24 pb-16">
        <div className="mx-auto w-full max-w-7xl px-6 text-center lg:px-12">
          <p className="text-xs font-medium uppercase tracking-[0.35em] text-accent">Technical excellence</p>
          <h1 className="mx-auto mt-4 max-w-5xl text-balance text-5xl font-black tracking-tight sm:text-6xl lg:text-7xl">
            Cinematic Mastery
            <br />
            <span className="text-accent">in Every Pixel.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-2xl">
            Harness the precision of high-end camera optics and professional lighting rigs, powered by state-of-the-art
            AI.
          </p>
        </div>
      </section>

      <section className="border-t border-border py-20">
        <div className="mx-auto w-full max-w-7xl px-6 lg:px-12">
          <div className="mb-10 text-center">
            <p className="text-xs font-medium uppercase tracking-[0.35em] text-accent">Style presets</p>
            <h3 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              Pick the look that fits your brand
            </h3>
            <p className="mx-auto mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              These presets mirror the visual directions available in Dashboard Generate, and they apply across the
              product categories configured in Dashboard Settings.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {[
                'Apparel & Streetwear',
                'Accessories',
                'Footwear',
                'Sportswear',
                'Luxury Fashion',
              ].map((category) => (
                <span
                  key={category}
                  className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
                >
                  {category}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="rounded-xl border border-white/10 bg-[#101319] p-6 transition-colors hover:border-red-500/45 hover:bg-red-500/[0.06]"
            >
              <feature.Icon className="h-5 w-5 text-accent" />
              <h2 className="mt-4 text-xl font-semibold tracking-tight text-foreground">{feature.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </article>
          ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border py-16">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 lg:grid-cols-[1fr_1.15fr] lg:items-stretch lg:px-12">
          <div className="rounded-xl border border-white/10 bg-[#0f1218] p-6 lg:p-8">
            <p className="text-[10px] uppercase tracking-[0.28em] text-accent">Module 01</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-4xl">Instant Product Shoots</h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Transform a single flat-lay or raw product image into a full-scale commercial campaign. Upload once,
              render infinitely.
            </p>

            <div className="mt-6 space-y-3">
              {[
                {
                  title: 'Infinite Lighting',
                  body: "Dynamic ray-traced lighting that adapts to your product's specific geometry and material properties.",
                  Icon: SunMedium,
                },
                {
                  title: 'Anamorphic Lens Simulation',
                  body: 'Authentic lens flares, chromatic aberration, and cinematic bokeh that replicate 50x cinema glass.',
                  Icon: Aperture,
                },
                {
                  title: 'Dynamic Angles',
                  body: 'Rotate your product in 3D space to find the perfect hero shot without a physical rig.',
                  Icon: Orbit,
                },
              ].map((item) => (
                <article key={item.title} className="rounded-md border border-white/10 bg-black/25 p-4">
                  <div className="flex items-start gap-3">
                    <item.Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#0f1218] p-4">
            <div className="grid h-full min-h-[420px] grid-cols-3 grid-rows-2 gap-3">
              <div className="relative col-span-2 overflow-hidden rounded-lg border border-white/10 bg-[radial-gradient(circle_at_30%_20%,#2f3d4f_0%,#101722_55%,#070b11_100%)]">
                <span className="absolute left-3 top-3 rounded bg-accent px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-accent-foreground">
                  Original input
                </span>
              </div>
              <div className="overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(160deg,#e9ecef_0%,#d6dbe0_58%,#b9c1ca_100%)]" />
              <div className="overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(160deg,#7f5a37_0%,#4f3622_42%,#241812_100%)]" />
              <div className="relative col-span-2 overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(160deg,#8fa2a4_0%,#6f8a90_48%,#3f5156_100%)]">
                <span className="absolute bottom-3 right-3 rounded bg-black/40 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-white/80">
                  Nano Banana 2
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border py-16">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:px-12">
          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0f1218] p-3">
            <MockupsPhotorealSlider />
          </div>

          <div className="rounded-xl border border-white/10 bg-[#0f1218] p-6 lg:p-8">
            <p className="text-[10px] uppercase tracking-[0.28em] text-accent">Module 02</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-4xl">Mockups to ProtoReal</h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Convert draft mockups into photoreal campaign outputs. This flow is tuned for fast transitions from
              concept assets to production-ready visuals.
            </p>

            <div className="mt-8 space-y-5">
              {[
                { label: 'Fabric Texture Preservation', value: '99.8% fidelity', width: 'w-[95%]' },
                { label: 'Physics-Based Shadows', value: 'Ray-traced', width: 'w-[92%]' },
                { label: 'Studio Lighting Integration', value: 'Global illum', width: 'w-[94%]' },
              ].map((row) => (
                <div key={row.label}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xl font-semibold tracking-tight text-foreground">{row.label}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent/80">{row.value}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/10">
                    <div className={`h-full rounded-full bg-accent ${row.width}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border py-16">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:px-12">
          <div className="rounded-xl border border-white/10 bg-[#0d1118] p-7 lg:p-9">
            <p className="text-[10px] uppercase tracking-[0.28em] text-accent">Module 03</p>
            <h2 className="mt-3 max-w-xl text-4xl font-black tracking-tight text-foreground sm:text-5xl">
              All-in-one AI background remover & generator
            </h2>

            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Remove distracting scenes and isolate your product with clean edges for catalog-ready results.
            </p>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Then instantly generate polished backdrops for ads and launch creative, without rebuilding your shot from
              scratch.
            </p>

            <div className="mt-7 flex flex-wrap gap-2">
              {['Edge precision masking', 'Transparent PNG export', 'Custom backdrop generation'].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-[#171c24] p-4 lg:p-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-[url('/images/original-bg.png')] bg-cover bg-center">
                <span className="absolute left-3 top-3 rounded bg-black/40 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-white/80">
                  Original
                </span>
              </div>
              <div className="relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-[url('/images/generated-bg.png')] bg-cover bg-center">
                <span className="absolute left-3 top-3 rounded bg-accent/90 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-accent-foreground">
                  Generated background
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="cta" className="border-t border-border py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_95%_8%,rgba(239,68,68,0.14),transparent_40%),linear-gradient(180deg,#12141a_0%,#0f1117_100%)] px-6 py-10 sm:px-10 sm:py-12">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="max-w-2xl">
                <h2 className="text-balance text-4xl sm:text-5xl font-black tracking-tight text-foreground">
                  Ready to redefine your visual identity?
                </h2>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                  Join the elite brands already using Ceriga Shots to dominate their markets with cinematic precision.
                </p>

                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  <Link
                    href="/dashboard/generate"
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
                  >
                    Get Started Now
                  </Link>
                  <Link
                    href="/pricing"
                    className="inline-flex items-center justify-center rounded-md border border-white/15 px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-white/5"
                  >
                    Book a Demo
                  </Link>
                </div>
              </div>

              <div className="mx-auto lg:mx-0 w-full max-w-[290px] rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent/20 text-accent">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-base font-semibold text-foreground">Enterprise Ready</div>
                    <div className="text-xs text-muted-foreground">SOC2 Type II Compliant</div>
                  </div>
                </div>
                <div className="mt-5 space-y-2">
                  <div className="h-2 rounded-full bg-white/10" />
                  <div className="h-2 w-4/5 rounded-full bg-white/10" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  )
}

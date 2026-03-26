import { Aperture, Boxes, Layers3, Sparkles, Zap } from 'lucide-react'

export function HomeTechnicalSuperiority() {
  return (
    <section id="how-it-works" className="border-t border-border py-24">
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-12">
        <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-muted-foreground">Core capabilities</p>
        <h2 className="mt-2 text-4xl font-black tracking-tight text-foreground sm:text-5xl">Technical Superiority</h2>

        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <article className="relative overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_40%_10%,rgba(239,68,68,0.22),transparent_40%),linear-gradient(160deg,#18120f_0%,#0f0f13_45%,#0a0b0f_100%)] p-6 lg:col-span-8 lg:min-h-[360px]">
            <div className="absolute inset-0 bg-[linear-gradient(25deg,rgba(239,68,68,0.24)_0%,transparent_34%,rgba(239,68,68,0.12)_64%,transparent_100%)]" />
            <div className="relative">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Neural engine</p>
              <h3 className="mt-2 text-4xl font-black tracking-tight text-foreground">Sub-pixel fidelity</h3>
              <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
                Model pipeline tuned for design preservation so logo placement, garment structure, and texture detail
                remain consistent across every generated variation.
              </p>
            </div>
          </article>

          <article className="rounded-xl border border-white/10 bg-[#16171d] p-6 lg:col-span-4 lg:min-h-[360px]">
            <Zap className="h-5 w-5 text-accent" />
            <h3 className="mt-24 text-3xl font-black tracking-tight text-foreground">Instant queue</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Real-time iteration with low-latency generation jobs and immediate result hydration in your project view.
            </p>
          </article>

          <article className="rounded-xl border border-white/10 bg-[#16171d] p-6 lg:col-span-4 lg:min-h-[240px]">
            <Aperture className="h-5 w-5 text-accent" />
            <h3 className="mt-10 text-3xl font-black tracking-tight text-foreground">Optical depth</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Natural lens falloff, shadow shaping, and highlight roll-off tailored to apparel commerce outputs.
            </p>
          </article>

          <article className="rounded-xl border border-white/10 bg-[#16171d] p-6 lg:col-span-4 lg:min-h-[240px]">
            <Layers3 className="h-5 w-5 text-accent" />
            <h3 className="mt-10 text-3xl font-black tracking-tight text-foreground">Preset control</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Urban concrete and Studio directions with shot-level selection for top-down, print close-up, and hanging
              shot composition.
            </p>
          </article>

          <article className="rounded-xl border border-white/10 bg-[#16171d] p-6 lg:col-span-4 lg:min-h-[240px]">
            <Boxes className="h-5 w-5 text-accent" />
            <h3 className="mt-10 text-3xl font-black tracking-tight text-foreground">Direct asset output</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Export-ready image sets for PDP, ad, and social workflows with batch-friendly packaging.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {['PNG', 'JPG', 'WEBP', 'ZIP'].map((format) => (
                <span key={format} className="rounded border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {format}
                </span>
              ))}
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

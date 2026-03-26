const visualDirections = [
  { key: 'raw', title: 'Urban concrete', subtitle: 'Aged urban concrete, overcast daylight' },
  { key: 'studio', title: 'Studio', subtitle: 'White backdrop, studio lighting' },
  { key: 'editorial', title: 'Editorial', subtitle: 'Seamless charcoal, diffused, cold' },
  { key: 'luxury', title: 'Luxury', subtitle: 'Dark marble, soft overhead' },
  { key: 'natural', title: 'Natural', subtitle: 'Aged wood, window light' },
  { key: 'surprise', title: 'Surprise me', subtitle: 'Random, never the same' },
] as const

const productCategories = [
  'Apparel & Streetwear',
  'Accessories',
  'Footwear',
  'Sportswear',
  'Luxury Fashion',
] as const

export function StylePresetsSection() {
  return (
    <section className="border-t border-border py-24">
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-12">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.35em] text-accent">Style presets</p>
          <h2 className="mt-3 text-4xl font-black tracking-tight text-foreground sm:text-5xl">
            Pick the look that fits your brand
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            These presets mirror the visual directions available in Dashboard Generate, and they apply across the
            product categories configured in Dashboard Settings.
          </p>
        </div>

        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {productCategories.map((category) => (
            <span
              key={category}
              className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
            >
              {category}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visualDirections.map((preset) => (
            <article
              key={preset.key}
              className="rounded-xl border border-white/10 bg-[#0d0f14] p-5 transition-colors hover:border-red-500/45 hover:bg-red-500/[0.06]"
            >
              <div className="text-xs uppercase tracking-[0.25em] text-accent">{preset.key}</div>
              <h3 className="mt-3 text-xl font-semibold tracking-tight text-foreground">{preset.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{preset.subtitle}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

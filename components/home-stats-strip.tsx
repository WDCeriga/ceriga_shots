export function HomeStatsStrip() {
  const stats = [
    { value: '1.2M+', label: 'Assets Generated' },
    { value: '850+', label: 'Active Brands' },
    { value: '1.4s', label: 'Avg. Gen Time' },
    { value: '92%', label: 'Cost Reduction' },
  ] as const

  return (
    <section className="border-t border-border py-9">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="grid grid-cols-2 gap-y-8 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-5xl font-black tracking-tight text-accent sm:text-6xl">{stat.value}</div>
              <p className="mt-2 text-[10px] uppercase tracking-[0.35em] text-muted-foreground/90">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

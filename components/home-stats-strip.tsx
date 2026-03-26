'use client'

import { useEffect, useMemo, useState } from 'react'

type WeeklyGeneratesResponse = {
  count?: number
}

export function HomeStatsStrip() {
  const [weeklyCount, setWeeklyCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch('/api/public/stats/generated-this-week', { method: 'GET' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`generated-this-week ${res.status}`)
        return (await res.json()) as WeeklyGeneratesResponse
      })
      .then((data) => {
        if (cancelled) return
        setWeeklyCount(typeof data.count === 'number' ? data.count : 0)
      })
      .catch(() => {
        if (cancelled) return
        setWeeklyCount(0)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const formattedCount = useMemo(() => {
    if (weeklyCount == null) return '...'
    return `${new Intl.NumberFormat().format(weeklyCount)}+`
  }, [weeklyCount])

  return (
    <section className="border-t border-border py-10">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="text-center">
          <div className="text-4xl font-black tracking-tight text-accent">{formattedCount}</div>
          <p className="mt-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Product images generated this week
          </p>
        </div>
      </div>
    </section>
  )
}

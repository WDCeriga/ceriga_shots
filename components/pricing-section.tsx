 "use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { Check } from "lucide-react"
import { pricingPlans } from "@/lib/pricing"
import { getStudioTrialCreditsLimit, getStudioTrialPeriodDays } from "@/lib/studio-trial"

type StripePricingResponse = {
  prices?: {
    starter?: { monthly?: number | null }
    studio?: { monthly?: number | null }
    label?: { monthly?: number | null }
  }
}

export function PricingSection() {
  const studioTrialDays = getStudioTrialPeriodDays()
  const studioTrialCredits = getStudioTrialCreditsLimit()
  const { status } = useSession()
  const pricingCtaHref = status === "authenticated" ? "/pricing" : "/signup"
  const [stripePrices, setStripePrices] = useState<StripePricingResponse["prices"] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/billing/pricing", { method: "GET" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`pricing ${res.status}`)
        return (await res.json()) as StripePricingResponse
      })
      .then((data) => {
        if (cancelled) return
        setStripePrices(data.prices ?? null)
      })
      .catch(() => {
        if (cancelled) return
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section id="pricing" className="py-32 border-t border-border">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="text-center mb-20">
          <span className="inline-flex items-center gap-3 mb-6">
            <span className="w-6 h-px bg-accent" />
            <span className="text-accent text-xs tracking-[0.3em] uppercase font-medium">
              Pricing
            </span>
            <span className="w-6 h-px bg-accent" />
          </span>
          <h2 className="text-4xl lg:text-5xl font-black tracking-tight text-foreground text-balance mb-6">
            Simple, transparent pricing.
          </h2>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-md mx-auto">
            Start free. Upgrade when you&apos;re ready to scale your content production.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto mb-10">
          {pricingPlans.map((plan) => {
            const roleName = plan.name.toLowerCase()
            const stripeMonthly =
              roleName === "starter" || roleName === "studio" || roleName === "label"
                ? stripePrices?.[roleName]?.monthly
                : null
            const displayMonthly = stripeMonthly ?? plan.monthlyPrice

            return (
              <div
                key={plan.name}
                className={`relative flex flex-col border p-7 transition-colors duration-300 ${
                  plan.highlighted
                    ? "border-accent bg-accent/[0.03]"
                    : "border-border hover:border-foreground/20"
                }`}
              >
              {plan.highlighted && (
                <span className="absolute -top-3 left-7 bg-accent text-foreground text-[10px] tracking-[0.2em] uppercase font-bold px-3 py-1">
                  Most Popular
                </span>
              )}

              <div className="mb-6">
                <h3 className="text-xs tracking-[0.2em] uppercase font-semibold text-muted-foreground mb-3">
                  {plan.name}
                </h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-black text-foreground tracking-tight">
                    €{displayMonthly}
                  </span>
                  <span className="text-muted-foreground text-sm">/ mo</span>
                </div>
                <p className="text-accent text-xs font-semibold tracking-wide mb-3">
                  {roleName === "studio" && studioTrialDays != null
                    ? `${studioTrialCredits} credits during trial · ${plan.creditsPerMonth} credits / mo after`
                    : `${plan.creditsPerMonth} credits / mo`}
                </p>
                {roleName === "studio" && studioTrialDays != null ? (
                  <p className="text-xs font-semibold text-foreground/90 mb-2">
                    {studioTrialDays}-day free trial with {studioTrialCredits} credits, then €{displayMonthly}/mo
                  </p>
                ) : null}
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {plan.description}
                </p>
              </div>

              <ul className="flex-1 space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <Check className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={pricingCtaHref}
                className={`mt-auto inline-flex items-center justify-center text-xs font-semibold tracking-wider uppercase px-5 py-3.5 transition-all duration-300 ${
                  plan.highlighted
                    ? "bg-foreground text-background hover:bg-accent hover:text-foreground"
                    : "border border-border text-foreground hover:border-foreground"
                }`}
              >
                {plan.landingCta}
              </Link>
              </div>
            )
          })}
        </div>

        <div className="text-center">
          <Link
            href="/pricing"
            className="text-xs text-muted-foreground hover:text-foreground tracking-widest uppercase transition-colors duration-300 border-b border-border hover:border-foreground pb-1"
          >
            Compare all features →
          </Link>
        </div>
      </div>
    </section>
  )
}

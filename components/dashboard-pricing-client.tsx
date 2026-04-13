'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { pricingPlans } from '@/lib/pricing'
import { getStudioTrialPeriodDays } from '@/lib/studio-trial'
import { useSession } from 'next-auth/react'
import { toast } from '@/hooks/use-toast'

type BillingCycle = 'monthly' | 'yearly'

type FeatureValue = boolean | string

interface FeatureRow {
  name: string
  values: [FeatureValue, FeatureValue, FeatureValue, FeatureValue]
}

interface FeatureGroup {
  label: 'Generation' | 'Export' | 'Storage' | 'Support'
  rows: FeatureRow[]
}

type StripePricingResponse = {
  prices?: {
    starter?: { monthly?: number | null; yearly?: number | null }
    studio?: { monthly?: number | null; yearly?: number | null }
    label?: { monthly?: number | null; yearly?: number | null }
  }
}

const featureGroups: FeatureGroup[] = [
  {
    label: 'Generation',
    rows: [
      { name: 'Credits / month', values: ['8', '100', '300', '750'] },
      { name: 'Flat lay variants', values: ['2', '5', '5', '5'] },
      { name: 'Surface + detail shots', values: [false, false, true, true] },
      { name: 'Advanced presets', values: [false, true, true, true] },
      { name: 'Image editing', values: [false, false, true, true] },
    ],
  },
  {
    label: 'Export',
    rows: [
      { name: 'Batch ZIP download', values: [true, true, true, true] },
      { name: 'Share links', values: [true, true, true, true] },
      { name: 'Max export quality', values: ['Standard', 'HD', '4K', '4K'] },
    ],
  },
  {
    label: 'Storage',
    rows: [
      { name: 'Projects stored', values: ['3', '20', '100', 'Unlimited'] },
      { name: 'Generate additional views', values: [false, true, true, true] },
      { name: 'Asset history retention', values: ['7 days', '90 days', '1 year', 'Unlimited'] },
    ],
  },
  {
    label: 'Support',
    rows: [
      { name: 'Email support', values: [true, true, true, true] },
      { name: 'Priority queue', values: [false, false, true, true] },
      { name: 'Dedicated support', values: [false, false, false, true] },
    ],
  },
]

const productionComparisonRows = [
  {
    feature: 'Production Cost',
    traditionalStudio: '€5,000 - €50,000+',
    cerigaShotsAi: 'Starting at €19/mo',
  },
  {
    feature: 'Turnaround Time',
    traditionalStudio: '2 - 4 Weeks',
    cerigaShotsAi: 'Seconds',
  },
  {
    feature: 'Location Flexibility',
    traditionalStudio: 'Physical Logistics Only',
    cerigaShotsAi: 'Infinite Digital Worlds',
  },
  {
    feature: 'Retakes & Edits',
    traditionalStudio: 'Requires Reshoot',
    cerigaShotsAi: 'One-Click Regeneration',
  },
  {
    feature: 'Consistency',
    traditionalStudio: 'Varies by Session',
    cerigaShotsAi: 'Mathematically Precise',
  },
]

function CellValue({ value }: { value: FeatureValue }) {
  if (value === true) return <Check className="h-4 w-4 text-accent" />
  if (value === false) return <span className="text-muted-foreground/40">-</span>
  return <span className="text-sm text-foreground/90">{value}</span>
}

function getDisplayPrice(monthlyPrice: number, billing: BillingCycle) {
  if (billing === 'monthly') return monthlyPrice
  return Math.round(monthlyPrice * 0.8)
}

export function DashboardPricingClient() {
  const studioTrialDays = getStudioTrialPeriodDays()
  const { status: authStatus } = useSession()
  const [billing, setBilling] = useState<BillingCycle>('monthly')
  const [currentRole, setCurrentRole] = useState<string>('free')
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null)
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [stripePrices, setStripePrices] = useState<StripePricingResponse['prices'] | null>(null)

  useEffect(() => {
    if (authStatus !== 'authenticated') return
    let cancelled = false
    fetch('/api/me', { method: 'GET' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`me ${res.status}`)
        return (await res.json()) as {
          user?: {
            role?: string
            billing?: { subscriptionStatus?: string | null } | null
          }
        }
      })
      .then((data) => {
        if (cancelled) return
        setCurrentRole(data.user?.role ?? 'free')
        setSubscriptionStatus(data.user?.billing?.subscriptionStatus ?? null)
      })
      .catch(() => {
        if (cancelled) return
      })
    return () => {
      cancelled = true
    }
  }, [authStatus])

  useEffect(() => {
    let cancelled = false
    fetch('/api/billing/pricing', { method: 'GET' })
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

  const openCustomerPortal = async () => {
    setLoadingPlan('manage')
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? `Portal failed (${res.status})`)
      window.location.href = data.url
    } catch (error) {
      toast({
        title: 'Unable to open billing portal',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoadingPlan(null)
    }
  }

  const startCheckout = async (role: 'starter' | 'studio' | 'label') => {
    setLoadingPlan(role)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: role, billingCycle: billing }),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? `Checkout failed (${res.status})`)
      window.location.href = data.url
    } catch (error) {
      toast({
        title: 'Unable to start checkout',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
      setLoadingPlan(null)
    }
  }

  return (
    <div className="relative p-10 py-20 max-w-7xl mx-auto">
      <div className="mb-10 text-center">
        <h1 className="text-balance text-4xl sm:text-6xl font-black tracking-tight text-foreground mb-4">
          Pricing - Scale your content as you grow
        </h1>
        <p className="mx-auto max-w-3xl text-muted-foreground text-sm sm:text-2xl">
          From solo creators to high-fashion labels, achieve cinematic precision with our tailored AI generation plans.
        </p>
      </div>

      <div className="mb-10 flex items-center justify-center">
        <div className="inline-flex items-center rounded-lg border border-border p-1 bg-card">
          <button
            type="button"
            onClick={() => setBilling('monthly')}
            className={`min-w-[7.5rem] px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
              billing === 'monthly' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Monthly
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setBilling('yearly')}
              className={`min-w-[7.5rem] px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
                billing === 'yearly' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Yearly
            </button>
            <span className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-2/3 inline-flex items-center rounded-full border border-accent bg-accent px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-accent-foreground whitespace-nowrap">
              Save 20%
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-14">
        {pricingPlans.map((plan) => {
          const roleName = plan.name.toLowerCase()
          const isCurrentPlan = roleName === currentRole
          const hasActiveSubscription =
            subscriptionStatus !== null &&
            ['active', 'trialing', 'past_due'].includes(subscriptionStatus)
          const stripeMonthly =
            roleName === 'starter' || roleName === 'studio' || roleName === 'label'
              ? stripePrices?.[roleName]?.monthly
              : null
          const stripeYearly =
            roleName === 'starter' || roleName === 'studio' || roleName === 'label'
              ? stripePrices?.[roleName]?.yearly
              : null
          const monthlyPrice = stripeMonthly ?? plan.monthlyPrice
          const displayPrice =
            billing === 'yearly' ? stripeYearly ?? getDisplayPrice(monthlyPrice, 'yearly') : monthlyPrice
          const yearlySuffix = billing === 'yearly' ? '/mo (billed yearly)' : '/mo'

          return (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-xl border p-6 ${
                plan.highlighted
                  ? 'border-accent bg-accent/[0.06] shadow-xl shadow-accent/25 ring-1 ring-accent/30'
                  : 'border-border bg-card'
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-foreground">
                  Recommended
                </span>
              )}

              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold mb-2">
                {plan.name}
              </p>
              <p className="text-xs text-accent mb-4">{plan.useCase}</p>

              <div className="mb-3 flex items-end gap-1">
                <span className="text-5xl font-black tracking-tight text-foreground">€{displayPrice}</span>
                <span className="pb-1 text-xs text-muted-foreground">{yearlySuffix}</span>
              </div>
              {roleName === 'studio' && studioTrialDays != null ? (
                <p className="text-xs font-semibold text-accent mb-2">
                  {studioTrialDays}-day free trial, then €{displayPrice}
                  {yearlySuffix}
                </p>
              ) : null}
              <p className="text-sm font-medium text-accent mb-3">{plan.creditsPerMonth} credits / mo</p>
              <p className="text-sm leading-relaxed text-muted-foreground mb-5">{plan.description}</p>

              <ul className="space-y-2.5 mb-7">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground/90">
                    <Check className="h-4 w-4 mt-0.5 text-accent shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {plan.name === 'Free' ? (
                <Link
                  href="/dashboard/generate"
                  className={`mt-auto inline-flex items-center justify-center rounded-md px-4 py-3 text-xs font-semibold tracking-wider uppercase transition-colors ${
                    plan.highlighted
                      ? 'bg-foreground text-background hover:bg-accent hover:text-foreground'
                      : 'border border-border text-foreground hover:border-foreground'
                  }`}
                >
                  {currentRole === 'free' ? 'Current plan' : plan.dashboardCta}
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={authStatus !== 'authenticated' || loadingPlan !== null}
                  onClick={() => {
                    if (isCurrentPlan && hasActiveSubscription) {
                      void openCustomerPortal()
                      return
                    }
                    if (isCurrentPlan && !hasActiveSubscription) {
                      return
                    }
                    if (roleName === 'starter' || roleName === 'studio' || roleName === 'label') {
                      void startCheckout(roleName)
                    }
                  }}
                  className={`mt-auto inline-flex items-center justify-center rounded-md px-4 py-3 text-xs font-semibold tracking-wider uppercase transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    plan.highlighted
                      ? 'bg-foreground text-background hover:bg-accent hover:text-foreground'
                      : 'border border-border text-foreground hover:border-foreground'
                  }`}
                >
                  {loadingPlan === plan.name.toLowerCase()
                    ? 'Redirecting...'
                    : isCurrentPlan
                      ? hasActiveSubscription
                        ? 'Manage subscription'
                        : 'Current plan'
                      : plan.dashboardCta}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="md:hidden divide-y divide-border/60 bg-card">
          {featureGroups.map((group) => (
            <section key={group.label} className="px-4 py-5">
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                {group.label}
              </h3>
              <div className="space-y-3">
                {group.rows.map((row) => (
                  <article key={row.name} className="rounded-lg border border-border/70 bg-background/60 p-3">
                    <p className="mb-2 text-sm font-medium text-foreground">{row.name}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {pricingPlans.map((plan, idx) => (
                        <div
                          key={`${row.name}-${plan.name}`}
                          className="rounded-md border border-border/50 bg-secondary/10 px-2.5 py-2"
                        >
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                            {plan.name}
                          </p>
                          <div className="flex items-center text-sm text-foreground/90">
                            <CellValue value={row.values[idx]} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-secondary/20">
                <th className="text-left px-4 py-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Features
                </th>
                {pricingPlans.map((plan) => (
                  <th key={plan.name} className="px-3 py-4 text-center text-xs uppercase tracking-[0.15em] text-muted-foreground">
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {featureGroups.map((group) => (
                <tr key={group.label}>
                  <td colSpan={5} className="p-0">
                    <div className="border-t border-border/70" />
                    <div className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground bg-secondary/10">
                      {group.label}
                    </div>
                    {group.rows.map((row) => (
                      <div
                        key={row.name}
                        className="grid grid-cols-[2fr_repeat(4,minmax(0,1fr))] border-t border-border/40"
                      >
                        <div className="px-4 py-3 text-sm text-foreground/90">{row.name}</div>
                        {row.values.map((value, idx) => (
                          <div key={`${row.name}-${idx}`} className="px-3 py-3 text-center flex justify-center items-center">
                            <CellValue value={value} />
                          </div>
                        ))}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <section className="mt-14 rounded-xl border border-border bg-[#090b10] overflow-hidden">
        <div className="px-4 py-10 sm:px-6">
          <h2 className="text-center text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
            The New Standard of Production
          </h2>
        </div>

        <div className="md:hidden space-y-3 px-4 pb-5">
          {productionComparisonRows.map((row) => (
            <article key={row.feature} className="rounded-lg border border-border/60 bg-black/20 p-3">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {row.feature}
              </p>
              <div className="space-y-2">
                <div className="rounded-md border border-border/50 bg-white/[0.02] px-3 py-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Traditional Studio
                  </p>
                  <p className="text-sm text-foreground/85">{row.traditionalStudio}</p>
                </div>
                <div className="rounded-md border border-accent/40 bg-accent/[0.08] px-3 py-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent/80">
                    Ceriga Shots AI
                  </p>
                  <p className="text-sm font-medium text-accent">{row.cerigaShotsAi}</p>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-y border-border/70 bg-white/[0.02]">
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Feature
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Traditional Studio
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                  Ceriga Shots AI
                </th>
              </tr>
            </thead>
            <tbody>
              {productionComparisonRows.map((row) => (
                <tr key={row.feature} className="border-b border-border/40">
                  <td className="px-4 py-4 text-sm font-medium text-foreground">{row.feature}</td>
                  <td className="px-4 py-4 text-sm text-foreground/75">{row.traditionalStudio}</td>
                  <td className="px-4 py-4 text-sm font-semibold text-accent">{row.cerigaShotsAi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-14 rounded-xl border border-border bg-black px-4 py-10 sm:px-8 sm:py-14">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl sm:text-3xl font-bold tracking-tight text-white mb-8 sm:mb-10">
            Frequently Asked Questions
          </h2>
          <Accordion type="single" collapsible className="w-full space-y-3 sm:space-y-4">
            {studioTrialDays != null ? (
              <AccordionItem
                value="studio-trial"
                className="border-0 rounded-xl bg-[#111111] px-5 py-1 sm:px-8 sm:py-2 data-[state=open]:shadow-none"
              >
                <AccordionTrigger className="text-left text-base font-semibold text-white hover:no-underline py-5 sm:py-6 [&[data-state=open]]:pb-2">
                  How does the Studio free trial work?
                </AccordionTrigger>
                <AccordionContent className="pb-5 sm:py-6 pt-0 text-sm leading-relaxed text-neutral-400">
                  New Studio subscriptions include {studioTrialDays} days of full Studio access at no charge. After the
                  trial, your chosen billing cycle continues automatically unless you cancel from Settings before the
                  trial ends.
                </AccordionContent>
              </AccordionItem>
            ) : null}
            <AccordionItem
              value="brand-accuracy"
              className="border-0 rounded-xl bg-[#111111] px-5 py-1 sm:px-8 sm:py-2 data-[state=open]:shadow-none"
            >
              <AccordionTrigger className="text-left text-base font-semibold text-white hover:no-underline py-5 sm:py-6 [&[data-state=open]]:pb-2">
                How accurate is the brand representation?
              </AccordionTrigger>
              <AccordionContent className="pb-5 sm:pb-6 pt-0 text-sm leading-relaxed text-neutral-400">
                Our Studio and Label plans allow you to train custom LoRA models on your specific products, ensuring
                99.9% geometric and texture accuracy for your brand assets.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem
              value="ownership"
              className="border-0 rounded-xl bg-[#111111] px-5 py-1 sm:px-8 sm:py-2"
            >
              <AccordionTrigger className="text-left text-base font-semibold text-white hover:no-underline py-5 sm:py-6 [&[data-state=open]]:pb-2">
                Who owns the generated content?
              </AccordionTrigger>
              <AccordionContent className="pb-5 sm:pb-6 pt-0 text-sm leading-relaxed text-neutral-400">
                You maintain 100% commercial ownership of all assets generated on paid plans. Free plan assets are
                under a creative commons attribution license.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem
              value="cancel"
              className="border-0 rounded-xl bg-[#111111] px-5 py-1 sm:px-8 sm:py-2"
            >
              <AccordionTrigger className="text-left text-base font-semibold text-white hover:no-underline py-5 sm:py-6 [&[data-state=open]]:pb-2">
                Can I cancel my subscription anytime?
              </AccordionTrigger>
              <AccordionContent className="pb-5 sm:pb-6 pt-0 text-sm leading-relaxed text-neutral-400">
                Yes. All subscriptions are month-to-month. You can upgrade, downgrade, or cancel directly from your
                Studio dashboard without any hidden fees.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

    </div>
  )
}

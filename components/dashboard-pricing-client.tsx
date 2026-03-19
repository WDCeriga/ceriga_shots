'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { pricingPlans } from '@/lib/pricing'
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
      { name: 'Flat lay variants', values: ['2', '5', '5', '5'] },
      { name: 'Surface + detail shots', values: [false, false, true, true] },
      { name: 'Advanced presets', values: [false, true, true, true] },
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
      { name: 'Projects stored', values: ['1', '20', '100', 'Unlimited'] },
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
    <div className="relative p-6 sm:p-10 pb-28 max-w-7xl mx-auto">
      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground mb-3">Pricing</h1>
        <p className="text-muted-foreground text-sm sm:text-base max-w-2xl">
          Pick the plan that matches your content volume, then scale when your brand grows.
        </p>
      </div>

      <div className="mb-8 flex flex-col sm:flex-row items-center justify-center gap-4">
        <div className="inline-flex items-center rounded-lg border border-border p-1 bg-card">
          <button
            type="button"
            onClick={() => setBilling('monthly')}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
              billing === 'monthly' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBilling('yearly')}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
              billing === 'yearly' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Yearly
          </button>
        </div>
        <span className="inline-flex items-center rounded-full border border-accent/50 bg-accent/10 px-3 py-1 text-xs font-semibold tracking-wide text-accent">
          Save 20%
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-14">
        {pricingPlans.map((plan) => {
          const roleName = plan.name.toLowerCase()
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
                    if (
                      roleName === currentRole &&
                      subscriptionStatus &&
                      ['active', 'trialing', 'past_due'].includes(subscriptionStatus)
                    ) {
                      void openCustomerPortal()
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
                    : plan.name.toLowerCase() === currentRole &&
                        subscriptionStatus &&
                        ['active', 'trialing', 'past_due'].includes(subscriptionStatus)
                      ? 'Manage subscription'
                      : plan.dashboardCta}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
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

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-3">
          <p className="hidden sm:block text-sm text-muted-foreground">
            Launch faster with predictable pricing and flexible monthly credits.
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/dashboard/generate"
              className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-foreground hover:border-foreground transition-colors"
            >
              Start free
            </Link>
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-xs font-semibold uppercase tracking-wider text-background hover:bg-accent hover:text-foreground transition-colors"
            >
              Book demo
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

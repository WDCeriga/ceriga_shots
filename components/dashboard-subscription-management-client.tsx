'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from '@/hooks/use-toast'
import { pricingPlans } from '@/lib/pricing'
import { getStudioTrialCreditsLimit, getStudioTrialPeriodDays } from '@/lib/studio-trial'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { StudioTrialUpgradeDialog } from '@/components/studio-trial-upgrade-dialog'


type MeResponse = {
  user?: {
    role?: string
    billing?: {
      subscriptionStatus?: string | null
      periodEndsAt?: string | null
    } | null
  }
}

function getSubscriptionBadgeVariant(subscriptionStatus: string | null) {
  if (!subscriptionStatus) return 'secondary'
  if (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') return 'secondary'
  if (subscriptionStatus === 'past_due') return 'destructive'
  return 'secondary'
}

export function DashboardSubscriptionManagementClient() {
  const studioTrialDays = getStudioTrialPeriodDays()
  const studioTrialCredits = getStudioTrialCreditsLimit()
  const { status: authStatus } = useSession()

  const [billing, setBilling] = useState<{
    role: string
    subscriptionStatus: string | null
    periodEndsAt: string | null
  } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [studioTrialModalOpen, setStudioTrialModalOpen] = useState(false)

  const isFree = billing?.role === 'free'

  useEffect(() => {
    if (authStatus !== 'authenticated') return
    let cancelled = false

    fetch('/api/me', { method: 'GET' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`me ${res.status}`)
        return (await res.json()) as MeResponse
      })
      .then((data) => {
        if (cancelled) return
        const role = data.user?.role ?? 'free'
        const subscriptionStatus = data.user?.billing?.subscriptionStatus ?? null
        const periodEndsAt = data.user?.billing?.periodEndsAt ?? null
        setBilling({ role, subscriptionStatus, periodEndsAt })
      })
      .catch(() => {
        if (cancelled) return
        setBilling({ role: 'free', subscriptionStatus: null, periodEndsAt: null })
      })

    return () => {
      cancelled = true
    }
  }, [authStatus])

  const openCustomerPortal = async () => {
    setActionLoading(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? `Portal failed (${res.status})`)
      window.location.href = data.url
    } catch (e) {
      toast({
        title: 'Unable to open billing portal',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(false)
    }
  }

  const startCheckout = async (targetRole: 'starter' | 'studio' | 'label') => {
    setActionLoading(true)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: targetRole, billingCycle: 'monthly' }),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? `Checkout failed (${res.status})`)
      window.location.href = data.url
    } catch (e) {
      toast({
        title: 'Unable to start checkout',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(false)
    }
  }

  const openStudioTrialModal = () => {
    setStudioTrialModalOpen(true)
  }

  const continueStudioUpgrade = async () => {
    setStudioTrialModalOpen(false)
    await startCheckout('studio')
  }

  return (
    <div className="relative p-6 sm:p-10 max-w-6xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {pricingPlans.map((plan) => {
          const planRole = plan.name.toLowerCase()
          const isCurrent = billing?.role === planRole
          const price = plan.monthlyPrice
          const recommended = plan.highlighted
          const buttonVariant = isCurrent ? 'secondary' : recommended ? 'secondary' : 'outline'

          return (
            <div
              key={plan.name}
              className={[
                'rounded-2xl border p-5 flex flex-col min-h-[220px]',
                isCurrent ? 'border-accent/60 bg-accent/[0.06] ring-1 ring-accent/20' : 'border-border/60 bg-[#0a0a0a]',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                    {plan.name}
                  </div>
                  <div className="mt-3 flex items-end gap-1">
                    <div className="text-4xl sm:text-5xl font-black tracking-tight text-foreground">
                      €{price}
                    </div>
                    <div className="pb-1 text-xs text-muted-foreground">/mo</div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {planRole === 'studio' && studioTrialDays != null
                      ? `${studioTrialCredits} credits during trial · ${plan.creditsPerMonth}/mo after`
                      : `${plan.creditsPerMonth} credits / month`}
                  </div>
                  {planRole === 'studio' && studioTrialDays != null ? (
                    <div className="mt-2 text-xs font-medium text-accent">
                      {studioTrialDays}-day free trial with {studioTrialCredits} credits on new subscriptions
                    </div>
                  ) : null}
                </div>
              </div>

              <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{plan.description}</p>

              <div className="mt-auto pt-5">
                {isCurrent ? (
                  planRole === 'free' ? (
                    <Button type="button" disabled className="w-full" variant="secondary">
                      Current plan
                    </Button>
                  ) : (
                    <Button
                      type="button"
                    disabled={actionLoading}
                      onClick={() => void openCustomerPortal()}
                      className="w-full"
                      variant="secondary"
                    >
                      {actionLoading ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Opening…
                        </span>
                      ) : (
                        'Manage subscription'
                      )}
                    </Button>
                  )
                ) : isFree ? (
                  <Button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => {
                      if (planRole === 'studio') {
                        openStudioTrialModal()
                        return
                      }
                      void startCheckout(planRole as 'starter' | 'studio' | 'label')
                    }}
                    className="w-full"
                    variant={buttonVariant}
                  >
                    Upgrade to {plan.name}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => {
                      if (planRole === 'studio') {
                        openStudioTrialModal()
                        return
                      }
                      void openCustomerPortal()
                    }}
                    className="w-full"
                    variant="outline"
                  >
                    Upgrade to {plan.name}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-6">
        <Card className="bg-[#0a0a0a] border-border/60">
          <CardContent className="space-y-3 p-5 sm:p-6">
            <div className="rounded-xl border border-border/60 bg-[#0a0a0a] px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">Payment</div>
                  <div className="mt-1 text-xs text-muted-foreground">Update your payment details</div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void openCustomerPortal()}
                  disabled={isFree || actionLoading}
                  className="border-accent/30 text-accent hover:border-accent/60 hover:bg-accent/5"
                >
                  Manage in Stripe
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <StudioTrialUpgradeDialog
        open={studioTrialModalOpen}
        onOpenChange={setStudioTrialModalOpen}
        onContinue={() => void continueStudioUpgrade()}
        isAuthenticated
      />
    </div>
  )
}


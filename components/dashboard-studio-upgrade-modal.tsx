'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Check, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getStudioTrialCreditsLimit, getStudioTrialPeriodDays } from '@/lib/studio-trial'

const STORAGE_KEY = 'ceriga-shots-studio-upgrade-modal-v2'

function shouldOfferStudioUpgrade(role: string | undefined): boolean {
  if (!role) return false
  if (role === 'admin') return false
  if (role === 'studio' || role === 'label') return false
  return true
}

type PromoAudience = 'visitor' | 'upgrade'

export function DashboardStudioUpgradeModal() {
  const router = useRouter()
  const { status } = useSession()
  const [open, setOpen] = useState(false)
  const [audience, setAudience] = useState<PromoAudience | null>(null)
  const trialDays = getStudioTrialPeriodDays()
  const trialCredits = getStudioTrialCreditsLimit()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.localStorage.getItem(STORAGE_KEY) === '1') return
    if (status === 'loading') return

    if (status === 'unauthenticated') {
      setAudience('visitor')
      setOpen(true)
      return
    }

    let cancelled = false
    fetch('/api/me')
      .then(async (res) => {
        if (res.status === 401) {
          return { unauthorized: true as const }
        }
        if (!res.ok) return null
        return (await res.json()) as { user?: { role?: string } }
      })
      .then((data) => {
        if (cancelled) return
        if (data && 'unauthorized' in data && data.unauthorized) {
          setAudience('visitor')
          setOpen(true)
          return
        }
        if (!data || !('user' in data) || !data.user) return
        if (shouldOfferStudioUpgrade(data.user.role)) {
          setAudience('upgrade')
          setOpen(true)
          return
        }
        setOpen(false)
        setAudience(null)
      })
      .catch(() => {
        if (cancelled) return
      })

    return () => {
      cancelled = true
    }
  }, [status])

  const persistDismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* ignore */
    }
    setOpen(false)
  }

  const PRICING_PATH = '/dashboard/pricing'

  const goToUpgrade = () => {
    persistDismiss()
    if (audience === 'visitor') {
      router.push(`/signup?callbackUrl=${encodeURIComponent(PRICING_PATH)}`)
      return
    }
    router.push(PRICING_PATH)
  }

  const trialActive = trialDays != null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) persistDismiss()
      }}
    >
      <DialogContent
        showCloseButton
        className="w-[calc(100%-1.5rem)] max-w-[min(100%,56rem)] translate-x-[-50%] translate-y-[-50%] gap-0 overflow-hidden rounded-2xl border-border p-0 sm:max-w-none md:max-w-[56rem]"
      >
        <div className="flex max-h-[min(90vh,720px)] flex-col overflow-y-auto md:max-h-none md:flex-row md:overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-8 bg-card p-6 sm:p-8 md:p-10">
            <DialogHeader className="space-y-3 text-left">
              <DialogTitle className="text-balance text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                Step up to{' '}
                <span className="bg-gradient-to-r from-accent via-foreground to-accent bg-clip-text text-transparent">
                  Ceriga Studio
                </span>
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-3 text-left text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {audience === 'visitor' ? (
                    <p>
                      You&apos;re viewing the dashboard without signing in. Create a free account to save projects, or
                      go straight to Studio for 4K exports, every visual preset, surface and detail shots, and AI image
                      edits — we&apos;re still hardening the product and welcome real-world use.
                    </p>
                  ) : (
                    <p>
                      We&apos;re still hardening the product and want real workflows on Studio — 4K exports, every visual
                      preset, surface and detail shots, and AI image edits. Upgrade when you&apos;re ready; you can keep
                      using the dashboard on your current plan until then.
                    </p>
                  )}
                  {trialActive ? (
                    <p>
                      Studio includes a free trial:{' '}
                      <span className="font-semibold text-foreground">
                        {trialDays} days with {trialCredits} credits
                      </span>{' '}
                      to explore, then your subscription continues with the normal Studio monthly credits and billing.
                    </p>
                  ) : (
                    <p>
                      Open <span className="font-semibold text-foreground">Pricing</span> to compare plans and subscribe
                      to Studio whenever it fits your volume.
                    </p>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>

            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Studio includes</p>
              <ul className="space-y-2.5">
                {[
                  'All shot categories and visual presets (including Luxury, Natural, Surprise)',
                  '4K exports and AI-powered image refinements',
                  trialActive
                    ? `Free trial: ${trialDays} days, ${trialCredits} credits, then full monthly allowance`
                    : 'Monthly credit pool sized for growing catalogs',
                  'Cancel or change plan from Settings → billing anytime',
                ].map((line) => (
                  <li key={line} className="flex gap-3 text-sm text-foreground/90">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3">
              <Button type="button" size="lg" className="w-full font-semibold" onClick={() => void goToUpgrade()}>
                {audience === 'visitor' ? 'Sign up to get Studio' : 'Upgrade to Studio'}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="w-full font-semibold border-border"
                onClick={() => persistDismiss()}
              >
                Not now
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                This prompt won&apos;t show again on this device after you choose an option or close it.
              </p>
            </div>
          </div>

          <div className="relative hidden min-h-[220px] w-full shrink-0 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-accent/35 via-background to-secondary md:flex md:min-h-0 md:w-[min(38%,20rem)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,oklch(0.65_0.2_25_/_0.35),transparent_55%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,oklch(0.25_0.05_260_/_0.5),transparent_50%)]" />
            <Sparkles
              className="relative z-[1] size-20 text-foreground/90 drop-shadow-[0_0_24px_oklch(0.54_0.21_25_/_0.6)] sm:size-24"
              strokeWidth={1.25}
              aria-hidden
            />
            <p className="relative z-[1] mt-4 max-w-[12rem] text-center text-[10px] font-semibold uppercase tracking-[0.25em] text-foreground/70">
              Studio plan
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

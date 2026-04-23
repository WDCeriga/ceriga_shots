'use client'

import { Check, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getStudioTrialCreditsLimit, getStudioTrialPeriodDays } from '@/lib/studio-trial'

interface StudioTrialUpgradeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onContinue: () => void | Promise<void>
  isAuthenticated: boolean
}

export function StudioTrialUpgradeDialog({
  open,
  onOpenChange,
  onContinue,
  isAuthenticated,
}: StudioTrialUpgradeDialogProps) {
  const trialDays = getStudioTrialPeriodDays()
  const trialCredits = getStudioTrialCreditsLimit()
  const trialActive = trialDays != null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                  {isAuthenticated ? (
                    <p>
                      We&apos;re still hardening the product and want real workflows on Studio - 4K exports, every visual
                      preset, surface and detail shots, and AI image edits. Upgrade when you&apos;re ready; you can keep
                      using the dashboard on your current plan until then.
                    </p>
                  ) : (
                    <p>
                      Create a free account, then continue to Studio for 4K exports, every visual preset, surface and
                      detail shots, and AI image edits.
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
                  'Cancel or change plan from Settings -> billing anytime',
                ].map((line) => (
                  <li key={line} className="flex gap-3 text-sm text-foreground/90">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3">
              <Button type="button" size="lg" className="w-full font-semibold" onClick={() => void onContinue()}>
                {isAuthenticated ? 'Start Studio Trial' : 'Sign up to start Studio trial'}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="w-full font-semibold border-border"
                onClick={() => onOpenChange(false)}
              >
                Not now
              </Button>
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

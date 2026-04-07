'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { useSession, signOut } from 'next-auth/react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { AlertTriangle, CheckCircle2, Infinity, Loader2, LogOut, Sparkles, User, Wrench } from 'lucide-react'
import { getRoleLimits, type UserRole } from '@/lib/roles'
import { fetchJsonCached, invalidateJsonCache, peekJsonCache } from '@/lib/client-fetch-cache'

type StatusResponse = {
  database: { configured: boolean }
  replicate: { configured: boolean }
  auth: { googleConfigured: boolean; secretConfigured: boolean }
}

type ProjectsCountResponse = {
  count?: number
}

const SETTINGS_ME_CACHE_KEY = 'settings-me'
const SETTINGS_PROJECT_COUNT_CACHE_KEY = 'settings-project-count'
const SETTINGS_STATUS_CACHE_KEY = 'settings-admin-status'

export default function SettingsPage() {
  const cachedMe = peekJsonCache<{
    user: {
      brandName: string | null
      role?: string
      billing?: {
        customerId: string | null
        subscriptionId: string | null
        subscriptionStatus: string | null
        periodEndsAt: string | null
      } | null
      credits?: {
        used: number
        limit: number
        remaining: number
        resetAt: string | null
      } | null
    }
  }>(SETTINGS_ME_CACHE_KEY)
  const cachedProjectCount = peekJsonCache<ProjectsCountResponse>(SETTINGS_PROJECT_COUNT_CACHE_KEY)
  const cachedStatus = peekJsonCache<StatusResponse>(SETTINGS_STATUS_CACHE_KEY)
  const { data: session, status: sessionStatus } = useSession()
  const [formData, setFormData] = useState({
    category: 'apparel',
  })
  const [initialData, setInitialData] = useState(formData)
  const [brandName, setBrandName] = useState<string>(cachedMe?.user.brandName ?? '')
  const [initialBrandName, setInitialBrandName] = useState<string>(cachedMe?.user.brandName ?? '')
  const [brandLoading, setBrandLoading] = useState(!cachedMe)
  const [brandSaving, setBrandSaving] = useState(false)
  const [sysStatus, setSysStatus] = useState<StatusResponse | null>(cachedStatus ?? null)
  const [statusLoading, setStatusLoading] = useState(!cachedStatus)
  const [accountPlan, setAccountPlan] = useState<string>(cachedMe?.user.role ?? 'free')
  const [billing, setBilling] = useState<{
    customerId: string | null
    subscriptionId: string | null
    subscriptionStatus: string | null
  } | null>(cachedMe?.user.billing ?? null)
  const [billingOpening, setBillingOpening] = useState(false)
  const [credits, setCredits] = useState<{
    used: number
    limit: number
    remaining: number
    resetAt: string | null
  } | null>(cachedMe?.user.credits ?? null)
  const [projectsUsed, setProjectsUsed] = useState<number | null>(
    typeof cachedProjectCount?.count === 'number' ? cachedProjectCount.count : null
  )
  const roleForLimits = (accountPlan as UserRole) ?? 'free'
  const projectLimit = getRoleLimits(roleForLimits).maxProjects
  const projectLimitLabel = projectLimit < 0 ? 'Unlimited' : `${projectLimit}`
  const retentionDays = getRoleLimits(roleForLimits).assetHistoryRetentionDays
  const retentionLabel = retentionDays < 0 ? 'Unlimited' : `${retentionDays} days`
  const hasUnsavedChanges = formData.category !== initialData.category || brandName.trim() !== initialBrandName

  useEffect(() => {
    const next = {
      category: window.localStorage.getItem('category') || 'apparel',
    }
    setFormData(next)
    setInitialData(next)
  }, [])

  useEffect(() => {
    let cancelled = false
    setBrandLoading(true)
    fetchJsonCached<{
      user: {
        brandName: string | null
        role?: string
        billing?: {
          customerId: string | null
          subscriptionId: string | null
          subscriptionStatus: string | null
          periodEndsAt: string | null
        } | null
        credits?: {
          used: number
          limit: number
          remaining: number
          resetAt: string | null
        } | null
      }
    }>(SETTINGS_ME_CACHE_KEY, '/api/me', { ttlMs: 20_000, init: { method: 'GET' } })
      .then((data) => {
        if (cancelled) return
        const next = data.user.brandName ?? ''
        setBrandName(next)
        setInitialBrandName(next)
        setAccountPlan(data.user.role ?? 'free')
        setBilling(data.user.billing ?? null)
        setCredits(data.user.credits ?? null)
      })
      .catch(() => {
        if (cancelled) return
      })
      .finally(() => {
        if (cancelled) return
        setBrandLoading(false)
      })

    fetchJsonCached<ProjectsCountResponse>(SETTINGS_PROJECT_COUNT_CACHE_KEY, '/api/projects/count', {
      ttlMs: 20_000,
      init: { method: 'GET' },
    })
      .then((data) => {
        if (cancelled) return
        setProjectsUsed(typeof data.count === 'number' ? data.count : 0)
      })
      .catch(() => {
        if (cancelled) return
        setProjectsUsed(null)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (accountPlan !== 'admin') {
      setSysStatus(null)
      setStatusLoading(false)
      return
    }

    let cancelled = false
    setStatusLoading(true)
    fetchJsonCached<StatusResponse>(SETTINGS_STATUS_CACHE_KEY, '/api/status', { ttlMs: 20_000, init: { method: 'GET' } })
      .then((data) => {
        if (cancelled) return
        setSysStatus(data)
      })
      .catch(() => {
        if (cancelled) return
        setSysStatus(null)
      })
      .finally(() => {
        if (cancelled) return
        setStatusLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [accountPlan])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSave = async () => {
    window.localStorage.setItem('category', formData.category)
    setInitialData(formData)

    const trimmedBrand = brandName.trim()
    if (trimmedBrand !== initialBrandName) {
      setBrandSaving(true)
      try {
        const res = await fetch('/api/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandName: trimmedBrand }),
        })
        const data = (await res.json()) as { user?: { brandName?: string | null }; error?: string }
        if (!res.ok) throw new Error(data.error ?? `Failed to save brand name: ${res.status}`)
        const next = data.user?.brandName ?? ''
        setBrandName(next)
        setInitialBrandName(next)
        invalidateJsonCache(SETTINGS_ME_CACHE_KEY)
      } catch (e) {
        toast({
          title: 'Failed to save brand name',
          description: e instanceof Error ? e.message : 'Please try again.',
          variant: 'destructive',
        })
      } finally {
        setBrandSaving(false)
      }
    }

    toast({ title: 'Settings saved' })
  }

  const statusBadge = (ok: boolean, okLabel: string, badLabel: string) => (
    <Badge variant={ok ? 'secondary' : 'destructive'} className="gap-1">
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
      {ok ? okLabel : badLabel}
    </Badge>
  )

  const handleManageBilling = async () => {
    setBillingOpening(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? `Failed to open billing portal (${res.status})`)
      }
      window.location.href = data.url
    } catch (error) {
      toast({
        title: 'Unable to open billing portal',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setBillingOpening(false)
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <div className="grid gap-4 lg:grid-cols-[1fr_2.2fr]">
        <Card className="bg-[#0a0a0a] border-border/70">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <User className="h-4 w-4 text-accent" />
              Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-border/60 bg-[#0a0a0a] px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
                Signed-in identity
              </div>
              {sessionStatus === 'loading' ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : session?.user?.email ? (
                <div className="text-base font-medium text-foreground truncate">{session.user.email}</div>
              ) : (
                <div className="text-sm text-muted-foreground">Not signed in</div>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button
              variant="outline"
              className="w-full bg-transparent border-border/70"
              disabled={!session?.user}
              onClick={() => signOut({ callbackUrl: '/' })}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </Button>
          </CardFooter>
        </Card>

        <Card className="bg-[#0a0a0a] border-border/70">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                Usage &amp; Plan
              </CardTitle>
              <Badge variant="secondary" className="capitalize">
                {accountPlan} plan
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-md border border-border/60 bg-[#0a0a0a] px-4 py-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Credits used</div>
                <div className="text-3xl font-bold leading-none">
                  {credits ? `${credits.used}` : '...'}
                  <span className="ml-1 text-base font-semibold text-muted-foreground">
                    / {credits?.limit != null && credits.limit < 0 ? 'Unlimited' : (credits?.limit ?? '...')}
                  </span>
                </div>
              </div>
              <div className="rounded-md border border-border/60 bg-[#0a0a0a] px-4 py-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Remaining</div>
                <div className="text-3xl font-bold leading-none">
                  {credits ? credits.remaining : '...'}
                </div>
              </div>
              <div className="rounded-md border border-border/60 bg-[#0a0a0a] px-4 py-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Project limit</div>
                <div className="text-3xl font-bold leading-none">
                  {projectLimit < 0 ? 'Unlimited' : projectLimit}
                </div>
              </div>
              <div className="rounded-md border border-border/60 bg-[#0a0a0a] px-4 py-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Asset retention</div>
                <div className="text-3xl font-bold leading-none">
                  {retentionDays < 0 ? 'Unlimited' : retentionLabel}
                </div>
              </div>
            </div>
            
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4 bg-[#0a0a0a] border-border/70">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-accent" />
            Preferences
          </CardTitle>
          <CardDescription>
            Brand name is saved to your account. Category is saved locally per device.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Brand name</label>
            <Input
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="Your brand name"
              maxLength={80}
              disabled={brandLoading || sessionStatus === 'loading' || !session?.user}
              className="bg-[#0a0a0a] border-border/60"
            />
            <p className="text-xs text-muted-foreground italic">
              {brandLoading ? 'Loading from your account…' : 'This name appears on exported assets and invoices.'}
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Product category</label>
            <select
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-border/60 rounded-lg bg-[#0a0a0a] text-foreground"
            >
              <option value="apparel">Apparel & Streetwear</option>
              <option value="accessories">Accessories</option>
              <option value="footwear">Footwear</option>
              <option value="sportswear">Sportswear</option>
              <option value="luxury">Luxury Fashion</option>
            </select>
            <p className="text-xs text-muted-foreground italic">
              Helps AI optimize generation for your specific niche.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 border-t border-border/40 pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {hasUnsavedChanges ? 'Unsaved changes will be lost if you leave this page.' : 'All changes saved.'}
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setFormData(initialData)
                setBrandName(initialBrandName)
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={brandSaving}>
              {brandSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </div>
        </div>
      </div>

      {sysStatus ? (
        <Card className="mt-6 bg-[#0a0a0a] border-border/70">
          <CardHeader className="border-b border-border/60">
            <CardTitle>System status</CardTitle>
            <CardDescription>Admin-only configuration checks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            {statusLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Checking…
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Database</div>
                    <div className="text-xs text-muted-foreground">Projects and users are stored in Neon.</div>
                  </div>
                  {statusBadge(sysStatus.database.configured, 'Connected', 'Missing DATABASE_URL')}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Replicate image generation</div>
                    <div className="text-xs text-muted-foreground">
                      If missing, we show placeholder tiles instead of failing.
                    </div>
                  </div>
                  {statusBadge(sysStatus.replicate.configured, 'Enabled', 'Missing REPLICATE_API_TOKEN')}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Google sign-in</div>
                    <div className="text-xs text-muted-foreground">Optional provider for NextAuth.</div>
                  </div>
                  {statusBadge(sysStatus.auth.googleConfigured, 'Configured', 'Not configured')}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Auth secret</div>
                    <div className="text-xs text-muted-foreground">
                      Recommended for stable sessions across restarts.
                    </div>
                  </div>
                  {statusBadge(sysStatus.auth.secretConfigured, 'Set', 'Not set')}
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="border-t border-border/60 justify-between">
            <div className="text-xs text-muted-foreground">Status checks never expose your secrets.</div>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Refresh
            </Button>
          </CardFooter>
        </Card>
      ) : null}
    </div>
  )
}

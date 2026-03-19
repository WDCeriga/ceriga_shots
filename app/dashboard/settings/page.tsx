'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { useSession, signOut } from 'next-auth/react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { AlertTriangle, CheckCircle2, Loader2, LogOut } from 'lucide-react'
import { getRoleLimits, type UserRole } from '@/lib/roles'

type StatusResponse = {
  database: { configured: boolean }
  gemini: { configured: boolean }
  auth: { googleConfigured: boolean; secretConfigured: boolean }
}

type ProjectsCountResponse = {
  projects?: Array<{ id: string }>
}

export default function SettingsPage() {
  const { data: session, status: sessionStatus } = useSession()
  const [formData, setFormData] = useState({
    category: 'apparel',
  })
  const [initialData, setInitialData] = useState(formData)
  const [brandName, setBrandName] = useState<string>('')
  const [initialBrandName, setInitialBrandName] = useState<string>('')
  const [brandLoading, setBrandLoading] = useState(true)
  const [brandSaving, setBrandSaving] = useState(false)
  const [sysStatus, setSysStatus] = useState<StatusResponse | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [accountPlan, setAccountPlan] = useState<string>('free')
  const [credits, setCredits] = useState<{
    used: number
    limit: number
    remaining: number
    resetAt: string | null
  } | null>(null)
  const [projectsUsed, setProjectsUsed] = useState<number | null>(null)
  const roleForLimits = (accountPlan as UserRole) ?? 'free'
  const projectLimit = getRoleLimits(roleForLimits).maxProjects
  const projectLimitLabel = projectLimit < 0 ? 'Unlimited' : `${projectLimit}`
  const retentionDays = getRoleLimits(roleForLimits).assetHistoryRetentionDays
  const retentionLabel = retentionDays < 0 ? 'Unlimited' : `${retentionDays} days`

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
    fetch('/api/me', { method: 'GET' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`me ${res.status}`)
        return (await res.json()) as {
          user: {
            brandName: string | null
            role?: string
            credits?: {
              used: number
              limit: number
              remaining: number
              resetAt: string | null
            } | null
          }
        }
      })
      .then((data) => {
        if (cancelled) return
        const next = data.user.brandName ?? ''
        setBrandName(next)
        setInitialBrandName(next)
        setAccountPlan(data.user.role ?? 'free')
        setCredits(data.user.credits ?? null)
      })
      .catch(() => {
        if (cancelled) return
      })
      .finally(() => {
        if (cancelled) return
        setBrandLoading(false)
      })

    fetch('/api/projects', { method: 'GET' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`projects ${res.status}`)
        return (await res.json()) as ProjectsCountResponse
      })
      .then((data) => {
        if (cancelled) return
        setProjectsUsed(Array.isArray(data.projects) ? data.projects.length : 0)
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
    fetch('/api/status', { method: 'GET' })
      .then(async (res) => {
        if (res.status === 404) return null
        if (!res.ok) throw new Error(`status ${res.status}`)
        return (await res.json()) as StatusResponse
      })
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

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Account, preferences, and system configuration.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Account</CardTitle>
            <CardDescription>Your signed-in identity and auth controls.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium">Signed in as</div>
                {sessionStatus === 'loading' ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                  </div>
                ) : session?.user?.email ? (
                  <div className="text-sm text-foreground truncate">{session.user.email}</div>
                ) : (
                  <div className="text-sm text-muted-foreground">Not signed in</div>
                )}
              </div>

              <Button
                variant="outline"
                className="shrink-0"
                disabled={!session?.user}
                onClick={() => signOut({ callbackUrl: '/' })}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Usage</CardTitle>
            <CardDescription>Plan and monthly credit usage.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Plan</span>
              <Badge variant="secondary" className="capitalize">
                {accountPlan}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Credits used</span>
              <span className="text-sm font-medium">
                {credits ? `${credits.used}/${credits.limit < 0 ? 'Unlimited' : credits.limit}` : '...'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Remaining</span>
              <span className="text-sm font-medium">{credits ? credits.remaining : '...'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Project limit</span>
              <span className="text-sm font-medium">
                {projectsUsed == null ? '.../' : `${projectsUsed}/`}
                {projectLimitLabel}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Asset history retention</span>
              <span className="text-sm font-medium">{retentionLabel}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Reset: {credits?.resetAt ? new Date(credits.resetAt).toLocaleString() : 'Pending'}
            </div>
            {retentionDays >= 0 ? (
              <div className="text-xs text-muted-foreground">
                Generated assets older than {retentionDays} days are automatically removed.
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Your generated asset history is retained without a time limit.
              </div>
            )}
          </CardContent>
        </Card>

        {sysStatus ? (
          <Card>
            <CardHeader className="border-b">
              <CardTitle>System status</CardTitle>
              <CardDescription>Admin-only configuration checks.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                      <div className="text-sm font-medium">Gemini image generation</div>
                      <div className="text-xs text-muted-foreground">
                        If missing, we show placeholder tiles instead of failing.
                      </div>
                    </div>
                    {statusBadge(sysStatus.gemini.configured, 'Enabled', 'Missing API key')}
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
            <CardFooter className="border-t justify-between">
              <div className="text-xs text-muted-foreground">
                Status checks never expose your secrets.
              </div>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Refresh
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        <Card className="lg:col-span-2">
          <CardHeader className="border-b">
            <CardTitle>Preferences</CardTitle>
            <CardDescription>
              Brand name is saved to your account. Category is saved locally (per device).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-medium">Brand name</label>
              <Input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="Your brand name"
                maxLength={80}
                disabled={brandLoading || sessionStatus === 'loading' || !session?.user}
              />
              <p className="text-xs text-muted-foreground">
                {brandLoading ? 'Loading from your account…' : 'Saved to your account and shared across devices.'}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Product category</label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
              >
                <option value="apparel">Apparel & Streetwear</option>
                <option value="accessories">Accessories</option>
                <option value="footwear">Footwear</option>
                <option value="sportswear">Sportswear</option>
                <option value="luxury">Luxury Fashion</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Will be used to tailor prompts and recommended shots.
              </p>
            </div>
          </CardContent>
          <CardFooter className="border-t justify-between gap-3 flex-col sm:flex-row sm:items-center">
            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={brandSaving}>
                {brandSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save'
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setFormData(initialData)
                  setBrandName(initialBrandName)
                }}
              >
                Cancel
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}

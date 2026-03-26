'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Clock3, Image as ImageIcon, MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjects } from '@/hooks/use-projects'
import { toast } from '@/hooks/use-toast'

function ProjectCardSkeleton() {
  return (
    <div className="border border-border rounded-lg overflow-hidden animate-pulse">
      <div className="aspect-square bg-secondary" />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-secondary rounded w-3/4" />
        <div className="h-3 bg-secondary rounded w-1/3" />
      </div>
    </div>
  )
}

function RecentProjectCard({
  project,
}: {
  project: {
    id: string
    name: string
    originalImage: string
    updatedAt: number
    generation?: { status?: string }
    generatedImages: { id: string }[]
    generatedCount?: number
  }
}) {
  return (
    <Link key={project.id} href={`/dashboard/results/${project.id}`}>
      <div className="group relative overflow-hidden rounded-xl border border-border/70 bg-card hover:border-accent/60 transition-colors cursor-pointer">
        <div className="aspect-square sm:aspect-[6/8] bg-secondary overflow-hidden">
          <img
            src={project.originalImage}
            alt={project.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

        <div className="absolute right-2 top-2 sm:right-3 sm:top-3">
          <span className="inline-flex items-center rounded-sm bg-white/20 px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
            {project.generation?.status === 'complete' ? 'Ready' : 'Draft'}
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3">
          <div className="mb-2 sm:mb-2.5 flex items-start justify-between gap-2">
            <p className="font-semibold text-sm sm:text-base leading-tight text-white line-clamp-2">{project.name}</p>
            <MoreVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white/70 shrink-0" />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs text-white/75">
            <span className="inline-flex items-center gap-1 sm:gap-1.5">
              <ImageIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              {project.generatedCount ?? project.generatedImages.length} Assets
            </span>
            <span className="inline-flex items-center gap-1 sm:gap-1.5">
              <Clock3 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              {formatRelativeTime(project.updatedAt)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

function formatRelativeTime(timestamp: number) {
  const diffMs = Date.now() - timestamp
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / minute))}m ago`
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`
  return `${Math.floor(diffMs / day)}d ago`
}

export default function DashboardHome() {
  const { projects, isLoading } = useProjects()
  const searchParams = useSearchParams()
  const [usageInfo, setUsageInfo] = useState<{
    role: string
    credits: {
      used: number
      limit: number
      remaining: number
      resetAt: string | null
    } | null
  } | null>(null)
  const [isUsageLoading, setIsUsageLoading] = useState(true)

  useEffect(() => {
    const verified = searchParams.get('verified')
    if (verified === 'true') {
      toast({
        title: 'Email verified',
        description: 'Your email has been verified. You can now generate content.',
      })
    } else if (verified === 'expired') {
      toast({
        title: 'Link expired',
        description: 'Your verification link has expired. Please request a new one.',
        variant: 'destructive',
      })
    } else if (verified === 'invalid') {
      toast({
        title: 'Invalid link',
        description: 'The verification link is invalid. Please request a new one.',
        variant: 'destructive',
      })
    }
  }, [searchParams])

  useEffect(() => {
    let cancelled = false

    fetch('/api/me', { method: 'GET' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`me ${res.status}`)
        return (await res.json()) as {
          user?: {
            role?: string
            credits?: {
              used?: number
              limit?: number
              remaining?: number
              resetAt?: string | null
            } | null
          }
        }
      })
      .then((data) => {
        if (cancelled) return
        setUsageInfo({
          role: data.user?.role ?? 'free',
          credits: data.user?.credits
            ? {
                used: data.user.credits.used ?? 0,
                limit: data.user.credits.limit ?? 0,
                remaining: data.user.credits.remaining ?? 0,
                resetAt: data.user.credits.resetAt ?? null,
              }
            : null,
        })
      })
      .catch(() => {
        if (cancelled) return
        setUsageInfo(null)
      })
      .finally(() => {
        if (cancelled) return
        setIsUsageLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const assetsGenerated = useMemo(
    () =>
      projects.reduce(
        (total, project) => total + (project.generatedCount ?? project.generatedImages.length),
        0
      ),
    [projects]
  )

  const creditsUsed = usageInfo?.credits?.used ?? 0
  const creditsLimit = usageInfo?.credits?.limit ?? 0
  const creditsRemaining = usageInfo?.credits?.remaining ?? 0
  const usagePercent = creditsLimit > 0 ? Math.min(100, Math.round((creditsUsed / creditsLimit) * 100)) : 0
  const planLabel = usageInfo?.role ? usageInfo.role.charAt(0).toUpperCase() + usageInfo.role.slice(1) : 'Free'
  const resetLabel = usageInfo?.credits?.resetAt
    ? new Date(usageInfo.credits.resetAt).toLocaleDateString()
    : 'No reset date'
  const projectsLimit = 200
  const projectsUsedPercent =
    projectsLimit > 0 ? Math.min(100, Math.round((projects.length / projectsLimit) * 100)) : 0
  const recentProjectsMobile = projects.slice(0, 2)
  const recentProjectsDesktop = projects.slice(0, 3)

  return (
    <div className="relative min-h-screen">
      {/* Subtle grid background to match the index hero */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: `linear-gradient(var(--color-foreground) 1px, transparent 1px), linear-gradient(90deg, var(--color-foreground) 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
        }}
      />

      <div className="relative px-4 py-6 sm:p-8 max-w-6xl mx-auto">
      <div className="mb-10 sm:mb-12 rounded-xl p-4 sm:p-6">
        <h1 className="text-3xl sm:text-4xl font-bold mb-3 text-balance">Welcome to Ceriga Shots</h1>
        <p className="text-base sm:text-lg text-muted-foreground mb-6 sm:mb-8">
          Create AI-generated product content for your designs in seconds.
        </p>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
          <Link href="/dashboard/generate">
            <Button
              variant="outline"
              className="w-full min-h-[96px] sm:h-32 flex flex-col items-center justify-center gap-2.5 sm:gap-3 text-center bg-[#151821] border-border/70 hover:bg-[#1b1f29]"
            >
              <div className="text-2xl sm:text-3xl leading-none">+</div>
              <div>
                <div className="font-semibold">Create New</div>
                <div className="text-xs text-muted-foreground">Start generating content</div>
              </div>
            </Button>
          </Link>

          <div className="hidden sm:block rounded-lg border border-border/70 bg-gradient-to-b from-[#1a1d24] to-[#151821] p-4 sm:p-5">
            {isLoading ? (
              <div className="animate-pulse space-y-3">
                <div className="h-4 w-28 rounded bg-secondary" />
                <div className="h-3 w-24 rounded bg-secondary" />
                <div className="h-8 w-20 rounded bg-secondary" />
                <div className="h-1.5 w-full rounded bg-secondary" />
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold leading-tight text-foreground">Projects Created</p>
                  </div>
                  <div className="flex items-end gap-0.5 pt-1">
                    <span className="h-2 w-0.5 rounded bg-accent/65" />
                    <span className="h-3.5 w-0.5 rounded bg-accent/80" />
                    <span className="h-5 w-0.5 rounded bg-accent" />
                  </div>
                </div>

                <div className="mb-2.5 flex items-end justify-between gap-3">
                  <p className="text-4xl font-black tracking-tight leading-none text-foreground">
                    {projects.length}
                    <span className="ml-1 text-lg font-semibold text-muted-foreground">/ {projectsLimit}</span>
                  </p>
                  <p className="text-xs font-semibold text-accent">{projectsUsedPercent}% Used</p>
                </div>

                <div className="h-1.5 w-full rounded-full bg-secondary/80 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-500"
                    style={{ width: `${projectsUsedPercent}%` }}
                  />
                </div>
              </>
            )}
          </div>

          <Link href="/dashboard/library">
            <Button
              variant="outline"
              className="w-full min-h-[96px] sm:h-32 flex flex-col items-center justify-center gap-2.5 sm:gap-3 text-center bg-[#151821] border-border/70 hover:bg-[#1b1f29]"
            >
              <div className="text-2xl sm:text-3xl leading-none">→</div>
              <div>
                <div className="font-semibold">View Library</div>
                <div className="text-xs text-muted-foreground">
                  <span className="sm:hidden">
                    {isLoading ? 'Loading…' : `${projects.length} projects`}
                  </span>
                  <span className="hidden sm:inline">All your projects</span>
                </div>
              </div>
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_19rem] gap-8 items-start">
        <section className="rounded-xl border border-border/60 bg-[#12141a] p-4 sm:p-5">
          {isLoading ? (
            <div>
              <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Recent Projects</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <ProjectCardSkeleton key={i} />
                ))}
              </div>
            </div>
          ) : projects.length > 0 ? (
            <div>
              <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Recent Projects</h2>
              <div className="grid grid-cols-2 gap-3 sm:hidden">
                {recentProjectsMobile.map((project) => (
                  <RecentProjectCard key={project.id} project={project} />
                ))}
              </div>
              <div className="hidden sm:grid sm:grid-cols-3 gap-3 sm:gap-4">
                {recentProjectsDesktop.map((project) => (
                  <RecentProjectCard key={project.id} project={project} />
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <aside className="xl:sticky xl:top-6">
          <div className="rounded-xl border border-border/70 bg-[#151821] p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Usage</h2>
              <Link href="/pricing" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Manage
              </Link>
            </div>

            {isUsageLoading ? (
              <div className="space-y-2.5 animate-pulse">
                <div className="h-14 rounded-md bg-secondary" />
                <div className="h-14 rounded-md bg-secondary" />
                <div className="h-14 rounded-md bg-secondary" />
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="rounded-md border border-border/70 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Plan</p>
                  <p className="text-xl font-bold">{planLabel}</p>
                </div>
                <div className="rounded-md border border-border/70 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Credits</p>
                  <p className="text-xl font-bold">
                    {creditsRemaining}
                    <span className="text-sm font-medium text-muted-foreground"> left</span>
                  </p>
                  {creditsLimit > 0 ? (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {creditsUsed} / {creditsLimit} used
                    </p>
                  ) : null}
                </div>
                <div className="rounded-md border border-border/70 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Assets Generated</p>
                  <p className="text-xl font-bold">{assetsGenerated}</p>
                </div>

                <div className="pt-1">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Monthly usage</span>
                    <span>{usagePercent}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-accent transition-all duration-500" style={{ width: `${usagePercent}%` }} />
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">Resets on {resetLabel}</p>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
    </div>
  )
}

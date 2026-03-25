'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { SheetClose } from '@/components/ui/sheet'
import { useRole } from '@/hooks/use-role'
import { useState } from 'react'
import { useSession } from 'next-auth/react'

export function AppSidebar({
  className,
  variant = 'desktop',
}: {
  className?: string
  variant?: 'desktop' | 'mobile'
}) {
  const pathname = usePathname()
  const { role } = useRole()
  const { data: session, status: sessionStatus } = useSession()
  const isAdmin = role === 'admin'
  const [generateOpen, setGenerateOpen] = useState(() => pathname.startsWith('/dashboard/generate'))
  const [adminOpen, setAdminOpen] = useState(() => pathname.startsWith('/dashboard/admin'))

  const planLabel = role.charAt(0).toUpperCase() + role.slice(1)
  const userEmail = session?.user?.email ?? (sessionStatus === 'loading' ? 'Loading...' : '')

  const links = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/dashboard/library', label: 'Library' },
 //   { href: '/dashboard/pricing', label: 'Pricing' },
    { href: '/dashboard/settings', label: 'Settings' },
  ]
  const generateLinks: { href: string | null; label: string }[] = [
    { href: '/dashboard/generate/background-remove', label: 'Background remover' },
    { href: '/dashboard/generate/from-sketch', label: 'Sketch-to-3D Mockups' },
    { href: '/dashboard/generate', label: 'Product Shots' },
  ]
  const adminLinks = [
    { href: '/dashboard/admin/statistics', label: 'Statistics' },
    { href: '/dashboard/admin/users', label: 'Users' },
    { href: '/dashboard/admin/projects', label: 'All Projects' },
    { href: '/dashboard/admin/jobs', label: 'Queue Jobs' },
    { href: '/dashboard/admin/system', label: 'System Status' },
  ]

  const isActive = (href: string) => {
    // For leaf routes we want exact highlighting; otherwise parent groups like
    // `/dashboard/generate` would remain highlighted on subroutes like
    // `/dashboard/generate/from-sketch`.
    if (href === '/dashboard') return pathname === href
    if (href === '/dashboard/generate') return pathname === href
    return pathname.startsWith(href)
  }

  function MaybeSheetClose({ children }: { children: React.ReactNode }) {
    if (variant !== 'mobile') return children
    return <SheetClose asChild>{children}</SheetClose>
  }

  const content = (
    <>
      <div className="p-6 border-b border-border">
        <Link href="/" className="font-bold text-lg">
          <span>Ceriga Shots</span>
        </Link>
      </div>

      <nav className="flex-1 min-h-0 p-4 space-y-2">
        <MaybeSheetClose>
          <Link
            href="/dashboard"
            className={cn(
              'flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm font-medium',
              isActive('/dashboard')
                ? 'bg-accent text-accent-foreground'
                : 'text-foreground hover:bg-secondary'
            )}
          >
            Dashboard
          </Link>
        </MaybeSheetClose>

        <div className="pt-1">
          <button
            type="button"
            onClick={() => setGenerateOpen((v) => !v)}
            className={cn(
              'w-full flex items-center justify-between gap-3 px-4 py-2 rounded-lg transition-colors text-sm font-medium',
              pathname.startsWith('/dashboard/generate')
                ? 'bg-accent text-accent-foreground'
                : 'text-foreground hover:bg-secondary'
            )}
            aria-expanded={generateOpen}
          >
            <span>Generate</span>
            <span className="text-xs">{generateOpen ? '▾' : '▸'}</span>
          </button>

          {generateOpen ? (
            <div className="mt-2 ml-4 space-y-1 border-l border-border pl-3">
              {generateLinks.map((item, idx) =>
                item.href ? (
                  <MaybeSheetClose key={item.label}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center px-3 py-1.5 rounded-md transition-colors text-sm',
                        isActive(item.href)
                          ? 'bg-accent text-accent-foreground'
                          : 'text-foreground hover:bg-secondary'
                      )}
                    >
                      {item.label}
                    </Link>
                  </MaybeSheetClose>
                ) : (
                  <span
                    key={`${item.label}-${idx}`}
                    className="block px-3 py-1.5 rounded-md text-sm text-muted-foreground opacity-70 cursor-not-allowed select-none"
                  >
                    {item.label}
                  </span>
                )
              )}
            </div>
          ) : null}
        </div>

        {links
          .filter((link) => link.href !== '/dashboard')
          .map((link) => (
            <MaybeSheetClose key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  'flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm font-medium',
                  isActive(link.href)
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground hover:bg-secondary'
                )}
              >
                {link.label}
              </Link>
            </MaybeSheetClose>
          ))}

        {isAdmin ? (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setAdminOpen((v) => !v)}
              className={cn(
                'w-full flex items-center justify-between gap-3 px-4 py-2 rounded-lg transition-colors text-sm font-medium',
                pathname.startsWith('/dashboard/admin')
                  ? 'bg-accent text-accent-foreground'
                  : 'text-foreground hover:bg-secondary'
              )}
              aria-expanded={adminOpen}
            >
              <span>Admin</span>
              <span className="text-xs">{adminOpen ? '▾' : '▸'}</span>
            </button>

            {adminOpen ? (
              <div className="mt-2 ml-4 space-y-1 border-l border-border pl-3">
                {adminLinks.map((link) => (
                  <MaybeSheetClose key={link.href}>
                    <Link
                      href={link.href}
                      className={cn(
                        'flex items-center px-3 py-1.5 rounded-md transition-colors text-sm',
                        isActive(link.href)
                          ? 'bg-accent text-accent-foreground'
                          : 'text-foreground hover:bg-secondary'
                      )}
                    >
                      {link.label}
                    </Link>
                  </MaybeSheetClose>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </nav>

      <div className="mt-auto p-4 border-t border-border space-y-3">
        <MaybeSheetClose>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to website
          </Link>
        </MaybeSheetClose>

        <div className="rounded-lg bg-card/40 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-white whitespace-nowrap">
                {planLabel} plan
              </div>
            </div>
            <MaybeSheetClose>
              <Link
                href="/dashboard/pricing"
                className="inline-flex items-center justify-center rounded-sm border border-white/15 bg-transparent px-4 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary hover:border-white/25 transition-colors"
              >
                Upgrade
              </Link>
            </MaybeSheetClose>
          </div>

          <div className="mt-2 text-xs text-muted-foreground truncate">{userEmail}</div>
        </div>
      </div>
    </>
  )

  return (
    <aside className={cn('w-64 border-r border-border bg-card flex h-full flex-col', className)}>
      {content}
    </aside>
  )
}

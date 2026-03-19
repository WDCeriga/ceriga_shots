'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { SheetClose } from '@/components/ui/sheet'
import { useRole } from '@/hooks/use-role'
import { useState } from 'react'

export function AppSidebar({
  className,
  variant = 'desktop',
}: {
  className?: string
  variant?: 'desktop' | 'mobile'
}) {
  const pathname = usePathname()
  const { role } = useRole()
  const isAdmin = role === 'admin'
  const [adminOpen, setAdminOpen] = useState(() => pathname.startsWith('/dashboard/admin'))

  const links = [
    { href: '/dashboard', label: 'Dashboard', icon: 'D' },
    { href: '/dashboard/generate', label: 'Generate', icon: 'G' },
    { href: '/dashboard/library', label: 'Library', icon: 'L' },
    { href: '/dashboard/pricing', label: 'Pricing', icon: 'P' },
    { href: '/dashboard/settings', label: 'Settings', icon: 'S' },
  ]
  const adminLinks = [
    { href: '/dashboard/admin/statistics', label: 'Statistics', icon: 'Σ' },
    { href: '/dashboard/admin/users', label: 'Users', icon: 'U' },
    { href: '/dashboard/admin/projects', label: 'All Projects', icon: 'A' },
    { href: '/dashboard/admin/jobs', label: 'Queue Jobs', icon: 'Q' },
    { href: '/dashboard/admin/system', label: 'System Status', icon: 'H' },
  ]

  const isActive = (href: string) => (href === '/dashboard' ? pathname === href : pathname.startsWith(href))

  function MaybeSheetClose({ children }: { children: React.ReactNode }) {
    if (variant !== 'mobile') return children
    return <SheetClose asChild>{children}</SheetClose>
  }

  const content = (
    <>
      <div className="p-6 border-b border-border">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <div className="w-6 h-6 bg-accent rounded flex items-center justify-center text-xs text-accent-foreground font-bold">
            CS
          </div>
          <span>Ceriga Shots</span>
        </Link>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {links.map((link) => (
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
              <span className="w-4 h-4 flex items-center justify-center text-xs">{link.icon}</span>
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
              <span className="flex items-center gap-3">
                <span className="w-4 h-4 flex items-center justify-center text-xs">M</span>
                Admin
              </span>
              <span className="text-xs">{adminOpen ? '▾' : '▸'}</span>
            </button>

            {adminOpen ? (
              <div className="mt-2 ml-4 space-y-1 border-l border-border pl-3">
                {adminLinks.map((link) => (
                  <MaybeSheetClose key={link.href}>
                    <Link
                      href={link.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-1.5 rounded-md transition-colors text-sm',
                        isActive(link.href)
                          ? 'bg-accent text-accent-foreground'
                          : 'text-foreground hover:bg-secondary'
                      )}
                    >
                      <span className="w-4 h-4 flex items-center justify-center text-xs">{link.icon}</span>
                      {link.label}
                    </Link>
                  </MaybeSheetClose>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </nav>

      <div className="p-4 border-t border-border">
        <MaybeSheetClose>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to website
          </Link>
        </MaybeSheetClose>
      </div>
    </>
  )

  return (
    <aside className={cn('w-64 border-r border-border bg-card flex flex-col', className)}>
      {content}
    </aside>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { SheetClose } from '@/components/ui/sheet'

export function AppSidebar({
  className,
  variant = 'desktop',
}: {
  className?: string
  variant?: 'desktop' | 'mobile'
}) {
  const pathname = usePathname()

  const links = [
    { href: '/dashboard/generate', label: 'Generate', icon: 'G' },
    { href: '/dashboard/library', label: 'Library', icon: 'L' },
    { href: '/dashboard/settings', label: 'Settings', icon: 'S' },
  ]

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
                pathname.startsWith(link.href)
                  ? 'bg-accent text-accent-foreground'
                  : 'text-foreground hover:bg-secondary'
              )}
            >
              <span className="w-4 h-4 flex items-center justify-center text-xs">{link.icon}</span>
              {link.label}
            </Link>
          </MaybeSheetClose>
        ))}
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

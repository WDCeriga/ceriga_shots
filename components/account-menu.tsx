'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export function AccountMenu() {
  const { data: session, status } = useSession()
  const [brandName, setBrandName] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    if (status !== 'authenticated' || !session?.user?.id) {
      setBrandName('')
      return () => {
        cancelled = true
      }
    }

    ;(async () => {
      try {
        const res = await fetch('/api/me', { method: 'GET' })
        if (!res.ok) return
        const data = (await res.json()) as { user?: { brandName?: string | null } }
        if (cancelled) return
        setBrandName(data.user?.brandName ?? '')
      } catch {
        // ignore
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status, session?.user?.id])

  if (status === 'loading') {
    return <div className="h-9 w-24 rounded-md bg-muted animate-pulse" />
  }

  if (!session?.user) {
    return (
      <Link href="/login">
        <Button size="sm" variant="outline">
          Sign in
        </Button>
      </Link>
    )
  }

  const displayBrand = brandName.trim()
  const title = displayBrand || session.user.name || 'Account'

  return (
    <Link
      href="/dashboard/settings"
      className="flex items-center gap-3 rounded-md px-2 pr-10 py-1 -mx-2 -my-1 hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Open settings"
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium truncate max-w-[160px]">
            {title}
          </span>
        </div>
      </div>
    </Link>
  )
}


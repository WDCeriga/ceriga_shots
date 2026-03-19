'use client'

import type { ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { useRole } from '@/hooks/use-role'

export function AdminGuard({ children }: { children: ReactNode }) {
  const { status } = useSession()
  const { role } = useRole()

  if (status === 'loading') {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Checking access...</p>
      </div>
    )
  }

  if (role !== 'admin') {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold">Admin access only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to view this section.
        </p>
      </div>
    )
  }

  return <>{children}</>
}

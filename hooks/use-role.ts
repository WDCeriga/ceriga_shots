'use client'

import { useSession } from 'next-auth/react'
import {
  type UserRole,
  type Feature,
  type RoleLimits,
  getRoleLimits,
  canAccess,
} from '@/lib/roles'

export function useRole() {
  const { data: session } = useSession()
  const role = (session?.user?.role as UserRole) ?? 'free'
  const limits = getRoleLimits(role)

  return {
    role,
    limits,
    canAccess: (feature: Feature) => canAccess(role, feature),
  }
}

export type { UserRole, Feature, RoleLimits }

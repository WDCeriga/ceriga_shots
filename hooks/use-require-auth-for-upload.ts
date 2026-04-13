'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from '@/hooks/use-toast'

/**
 * Blocks file uploads on generation flows until the user is signed in.
 */
export function useRequireAuthForUpload(callbackUrl: string) {
  const { status } = useSession()
  const router = useRouter()
  const isAuthed = status === 'authenticated'
  const isAuthLoading = status === 'loading'
  const uploadBlocked = !isAuthLoading && !isAuthed

  const ensureAuthForUpload = useCallback((): boolean => {
    if (isAuthLoading) return false
    if (isAuthed) return true
    toast({
      title: 'Sign in required',
      description: 'Sign in to upload files.',
      variant: 'destructive',
    })
    router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
    return false
  }, [callbackUrl, isAuthLoading, isAuthed, router])

  return { isAuthed, isAuthLoading, uploadBlocked, ensureAuthForUpload }
}

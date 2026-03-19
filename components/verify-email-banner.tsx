'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { AlertTriangle, Mail, X } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

export function VerifyEmailBanner() {
  const { data: session, status } = useSession()
  const [dismissed, setDismissed] = useState(false)
  const [sending, setSending] = useState(false)

  if (status !== 'authenticated') return null
  if (session?.user?.emailVerified) return null
  if (dismissed) return null

  const handleResend = async () => {
    if (sending) return
    setSending(true)
    try {
      const res = await fetch('/api/auth/verify-email/send', { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast({
          title: 'Failed to send',
          description: data.error || 'Please try again later.',
          variant: 'destructive',
        })
        return
      }
      toast({
        title: 'Verification email sent',
        description: 'Check your inbox for the verification link.',
      })
    } catch {
      toast({
        title: 'Failed to send',
        description: 'Please try again later.',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="relative bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 sm:px-6">
      <div className="flex items-center gap-3 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
        <p className="flex-1 text-amber-200">
          <span className="font-medium">Verify your email to start generating.</span>{' '}
          <span className="text-amber-200/80">Check your inbox for a verification link.</span>
        </p>
        <button
          type="button"
          onClick={handleResend}
          disabled={sending}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
        >
          <Mail className="h-3 w-3" />
          {sending ? 'Sending…' : 'Resend email'}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded p-0.5 text-amber-400/60 hover:text-amber-300 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

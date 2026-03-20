'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean }

      if (!res.ok) {
        if (res.status === 429 && data.error) {
          setError(data.error)
          return
        }
        // Non-fatal: still treat as submitted to avoid enumeration.
      }

      setSubmitted(true)
    } catch {
      // Non-fatal: still show submitted state.
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Reset your password</h1>
          <p className="text-sm text-muted-foreground">Enter your email and we&apos;ll send a reset link.</p>
        </div>

        {submitted ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              If an account exists for <span className="font-medium text-foreground">{email || 'your email'}</span>,
              you&apos;ll receive an email with a reset link.
            </p>
            <div className="mt-4 flex items-center justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/login')}
                disabled={loading}
              >
                Back to sign in
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium">Email</label>
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending link…' : 'Send reset link'}
            </Button>

            <p className="text-sm text-muted-foreground text-center">
              Remembered your password?{' '}
              <Link href="/login" className="underline underline-offset-2">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}


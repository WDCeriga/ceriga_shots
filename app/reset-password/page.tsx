'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = useMemo(() => {
    if (!token) return false
    if (password.length < 8) return false
    if (password !== confirmPassword) return false
    return true
  }, [confirmPassword, password, token])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean }

      if (!res.ok) {
        setError(data.error ?? 'Failed to reset password. Please try again.')
        return
      }

      setSuccess(true)
      router.replace('/login?reset=success')
    } catch {
      setError('Failed to reset password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Choose a new password</h1>
          <p className="text-sm text-muted-foreground">Your reset link may expire after a short time.</p>
        </div>

        {success ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Password updated. You can now sign in.</p>
            <div className="mt-4 flex items-center justify-center">
              <Button type="button" variant="outline" onClick={() => router.push('/login')} disabled={loading}>
                Back to sign in
              </Button>
            </div>
          </div>
        ) : !token ? (
          <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            Missing reset token.{' '}
            <Link href="/forgot-password" className="underline underline-offset-2 text-foreground hover:text-accent">
              Request a new reset link
            </Link>
            .
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium">New password</label>
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Confirm password</label>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <Button type="submit" className="w-full" disabled={!canSubmit || loading}>
              {loading ? 'Updating…' : 'Update password'}
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


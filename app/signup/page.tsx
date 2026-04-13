'use client'

import { FormEvent, Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { GoogleSignInButton } from '@/components/google-sign-in-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'

function safeCallbackUrl(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard'
  return raw
}

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'))

  const [brandName, setBrandName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandName, email, password }),
    })

    const data = await res.json()
    if (!res.ok) {
      setLoading(false)
      setError(data.error ?? 'Failed to sign up.')
      return
    }

    const loginRes = await signIn('credentials', {
      email,
      password,
      redirect: false,
      callbackUrl,
    })

    if (loginRes?.error) {
      setLoading(false)
      setError('Account created, but we could not sign you in automatically. Please try again.')
      return
    }

    await router.push(loginRes?.url ?? callbackUrl)
  }

  const loginHref =
    callbackUrl === '/dashboard' ? '/login' : `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Create your account</h1>
          <p className="text-sm text-muted-foreground">
            Sign up with Google or create an account with email.
          </p>
        </div>

        <div className="space-y-4">
          <GoogleSignInButton callbackUrl={callbackUrl} label="Sign up with Google" />

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs font-medium uppercase tracking-wide">
              <span className="bg-background text-muted-foreground px-3">Or email</span>
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium">Brand name (optional)</label>
            <Input
              type="text"
              autoComplete="organization"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="e.g. Ceriga"
              maxLength={80}
            />
            <p className="text-xs text-muted-foreground">
              This helps personalize your workspace. You can change it later.
            </p>
          </div>

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

          <div className="space-y-2">
            <label className="block text-sm font-medium">Password</label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-0 top-0 inline-flex h-9 w-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account…' : 'Sign up'}
          </Button>
        </form>

        <p className="text-sm text-muted-foreground text-center">
          Already have an account?{' '}
          <Link href={loginHref} className="underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="text-sm text-muted-foreground">Loading…</div>
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  )
}

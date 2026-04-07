'use client'

import { useEffect, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type AdminUser = {
  id: string
  email: string
  role: string
  createdAt: string
  projectCount: number
  credits: {
    used: number
    limit: number | null
    remaining: number | null
    unlimited: boolean
    resetAt: string | null
  }
}

const ROLE_OPTIONS = ['free', 'starter', 'studio', 'label'] as const

type CreditGrant = {
  id: string
  adminUserId: string
  adminEmail: string | null
  targetUserId: string
  targetEmail: string | null
  amount: number
  reason: string | null
  beforeCreditsUsed: number
  afterCreditsUsed: number
  createdAt: string
}

function formatCredits(u: AdminUser): string {
  if (u.credits.unlimited) return 'Unlimited'
  if (u.credits.remaining != null && u.credits.limit != null) {
    return `${u.credits.remaining}/${u.credits.limit}`
  }
  return '—'
}

function UsageDetails({ u }: { u: AdminUser }) {
  return (
    <div className="text-sm space-y-0.5">
      <div>{formatCredits(u)}</div>
      <div className="text-muted-foreground">Projects: {u.projectCount}</div>
      {!u.credits.unlimited && u.credits.resetAt ? (
        <div className="text-xs text-muted-foreground">
          Resets {new Date(u.credits.resetAt).toLocaleDateString()}
        </div>
      ) : null}
    </div>
  )
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [grants, setGrants] = useState<CreditGrant[]>([])
  const [error, setError] = useState<string | null>(null)
  const [grantUser, setGrantUser] = useState('')
  const [grantAmount, setGrantAmount] = useState('10')
  const [grantReason, setGrantReason] = useState('')
  const [grantLoading, setGrantLoading] = useState(false)
  const [grantFeedback, setGrantFeedback] = useState<string | null>(null)
  const [grantError, setGrantError] = useState<string | null>(null)
  const [grantModalOpen, setGrantModalOpen] = useState(false)
  const [roleUpdatingUserId, setRoleUpdatingUserId] = useState<string | null>(null)

  async function loadUsers() {
    const res = await fetch('/api/admin/users')
    const data = (await res.json().catch(() => ({}))) as { users?: AdminUser[]; error?: string }
    if (!res.ok) throw new Error(data.error || 'Failed to load users')
    setUsers(data.users ?? [])
  }

  async function loadGrants() {
    const res = await fetch('/api/admin/credits/grants?limit=50')
    const data = (await res.json().catch(() => ({}))) as { grants?: CreditGrant[]; error?: string }
    if (!res.ok) throw new Error(data.error || 'Failed to load credit grants')
    setGrants(data.grants ?? [])
  }

  useEffect(() => {
    Promise.all([loadUsers(), loadGrants()])
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load users'))
  }, [])

  async function submitGrantCredits() {
    setGrantFeedback(null)
    setGrantError(null)
    const amount = Number(grantAmount)
    if (!grantUser.trim()) {
      setGrantError('Please enter a user email or user ID.')
      return
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      setGrantError('Please enter a valid integer amount.')
      return
    }

    setGrantLoading(true)
    try {
      const res = await fetch('/api/admin/credits/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: grantUser.trim(),
          amount,
          reason: grantReason.trim() || null,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        grant?: {
          email: string
          amount: number
          after: { remaining: number; limit: number }
        }
      }
      if (!res.ok) throw new Error(data.error || 'Failed to grant credits')
      if (!data.grant) throw new Error('Missing grant response')
      setGrantFeedback(
        `Granted ${data.grant.amount} credits to ${data.grant.email}. Remaining: ${data.grant.after.remaining}/${data.grant.after.limit}.`
      )
      setGrantUser('')
      setGrantReason('')
      await Promise.all([loadUsers(), loadGrants()])
    } catch (e) {
      setGrantError(e instanceof Error ? e.message : 'Failed to grant credits')
    } finally {
      setGrantLoading(false)
    }
  }

  async function updateRole(userId: string, role: AdminUser['role']) {
    setGrantError(null)
    setGrantFeedback(null)
    setRoleUpdatingUserId(userId)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        user?: { id: string; role: string }
      }
      if (!res.ok) throw new Error(data.error || 'Failed to update role')
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)))
      setGrantFeedback('User role updated.')
      window.location.reload()
    } catch (e) {
      setGrantError(e instanceof Error ? e.message : 'Failed to update role')
      await loadUsers().catch(() => {})
    } finally {
      setRoleUpdatingUserId(null)
    }
  }

  const RoleEditor = ({ user }: { user: AdminUser }) => {
    const isUpdating = roleUpdatingUserId === user.id
    return (
      <div className="flex items-center gap-2">
        <Select
          value={user.role}
          disabled={isUpdating}
          onValueChange={(value) => void updateRole(user.id, value as AdminUser['role'])}
        >
          <SelectTrigger className="h-9 w-[160px] border-accent/55 bg-accent/10 px-3 text-sm font-semibold capitalize text-foreground shadow-sm transition-colors hover:border-accent/80 hover:bg-accent/15 focus:ring-2 focus:ring-accent/35">
            <SelectValue placeholder="Change" />
          </SelectTrigger>
          <SelectContent className="border-accent/40 bg-[#0a0a0a]">
            {ROLE_OPTIONS.map((role) => (
              <SelectItem key={role} value={role} className="capitalize text-sm">
                {role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isUpdating ? <span className="text-[10px] text-muted-foreground">Saving...</span> : null}
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4">
      <div className="rounded-xl border border-border/60 bg-[#0a0a0a] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Users</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Recent registered users, roles, and usage (credits and projects).
            </p>
          </div>
          <Dialog
            open={grantModalOpen}
            onOpenChange={(open) => {
              setGrantModalOpen(open)
              if (!open) {
                setGrantError(null)
                setGrantFeedback(null)
                setGrantLoading(false)
              }
            }}
          >
            <DialogTrigger asChild>
              <Button type="button">Grant Credits</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Grant Bonus Credits</DialogTitle>
                <DialogDescription>
                  Add one-time credits by reducing monthly credits used. Lookup supports email or user ID.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">User email or ID</label>
                  <Input
                    value={grantUser}
                    onChange={(e) => setGrantUser(e.target.value)}
                    placeholder="user@brand.com or UUID"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Credits to grant</label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={grantAmount}
                    onChange={(e) => setGrantAmount(e.target.value)}
                    placeholder="10"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Reason (optional)</label>
                  <Input
                    value={grantReason}
                    onChange={(e) => setGrantReason(e.target.value)}
                    placeholder="e.g. support credit for failed run"
                  />
                </div>
                {grantFeedback ? <p className="text-xs text-emerald-400">{grantFeedback}</p> : null}
                {grantError ? <p className="text-xs text-destructive">{grantError}</p> : null}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setGrantModalOpen(false)}>
                  Close
                </Button>
                <Button type="button" onClick={() => void submitGrantCredits()} disabled={grantLoading}>
                  {grantLoading ? 'Granting...' : 'Grant Credits'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {/* Mobile: stacked cards */}
      <div className="space-y-3 md:hidden">
        {users.map((u) => (
          <div
            key={u.id}
            className="rounded-xl border border-border/70 bg-[#0a0a0a] p-4 space-y-3 shadow-sm"
          >
            <div className="font-medium text-sm break-words leading-snug">{u.email}</div>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Role</dt>
                <dd className="mt-0.5"><RoleEditor user={u} /></dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Usage</dt>
                <dd className="mt-0.5">
                  <UsageDetails u={u} />
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Created</dt>
                <dd className="mt-0.5 break-words">{new Date(u.createdAt).toLocaleString()}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">User ID</dt>
                <dd className="mt-0.5 font-mono text-xs text-muted-foreground break-all">{u.id}</dd>
              </div>
            </dl>
          </div>
        ))}
        {users.length === 0 ? (
          <div className="rounded-xl border border-border/70 bg-[#0a0a0a] px-4 py-8 text-center text-sm text-muted-foreground">
            No users found.
          </div>
        ) : null}
      </div>

      {/* Tablet/desktop: table */}
      <div className="hidden md:block rounded-xl border border-border/70 bg-[#0a0a0a] p-2 sm:p-3 -mx-4 sm:mx-0">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[140px]">Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead className="min-w-[120px]">Created</TableHead>
              <TableHead className="min-w-[200px]">User ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="max-w-[220px] whitespace-normal break-words align-top">
                  {u.email}
                </TableCell>
                <TableCell className="align-top">
                  <RoleEditor user={u} />
                </TableCell>
                <TableCell className="align-top">
                  <UsageDetails u={u} />
                </TableCell>
                <TableCell className="whitespace-normal align-top text-sm">
                  {new Date(u.createdAt).toLocaleString()}
                </TableCell>
                <TableCell className="max-w-[240px] whitespace-normal break-all text-xs text-muted-foreground align-top font-mono">
                  {u.id}
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-xl border border-border/70 bg-[#0a0a0a] p-2 sm:p-3 -mx-4 sm:mx-0">
        <div className="px-2 pb-2">
          <h2 className="text-sm font-semibold">Recent Credit Grants</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Last 50 grants with before/after usage snapshots.
          </p>
        </div>
        <Table className="min-w-[840px]">
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Before Used</TableHead>
              <TableHead>After Used</TableHead>
              <TableHead>Granted By</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="text-sm whitespace-nowrap">{new Date(g.createdAt).toLocaleString()}</TableCell>
                <TableCell className="max-w-[220px] break-words">
                  <div className="text-sm">{g.targetEmail ?? g.targetUserId}</div>
                  <div className="text-xs text-muted-foreground font-mono break-all">{g.targetUserId}</div>
                </TableCell>
                <TableCell className="text-sm font-medium">+{g.amount}</TableCell>
                <TableCell className="text-sm">{g.beforeCreditsUsed}</TableCell>
                <TableCell className="text-sm">{g.afterCreditsUsed}</TableCell>
                <TableCell className="max-w-[220px] break-words">
                  <div className="text-sm">{g.adminEmail ?? g.adminUserId}</div>
                  <div className="text-xs text-muted-foreground font-mono break-all">{g.adminUserId}</div>
                </TableCell>
                <TableCell className="max-w-[280px] break-words text-sm text-muted-foreground">
                  {g.reason || '—'}
                </TableCell>
              </TableRow>
            ))}
            {grants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No credit grants yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

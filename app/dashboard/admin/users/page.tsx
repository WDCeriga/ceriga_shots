'use client'

import { useEffect, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/users')
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { users?: AdminUser[]; error?: string }
        if (!res.ok) throw new Error(data.error || 'Failed to load users')
        setUsers(data.users ?? [])
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load users'))
  }, [])

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4">
      <div className="rounded-xl border border-border/60 bg-[#12141a] p-4 sm:p-5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Recent registered users, roles, and usage (credits and projects).
        </p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {/* Mobile: stacked cards */}
      <div className="space-y-3 md:hidden">
        {users.map((u) => (
          <div
            key={u.id}
            className="rounded-xl border border-border/70 bg-[#151821] p-4 space-y-3 shadow-sm"
          >
            <div className="font-medium text-sm break-words leading-snug">{u.email}</div>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Role</dt>
                <dd className="capitalize mt-0.5">{u.role}</dd>
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
          <div className="rounded-xl border border-border/70 bg-[#151821] px-4 py-8 text-center text-sm text-muted-foreground">
            No users found.
          </div>
        ) : null}
      </div>

      {/* Tablet/desktop: table */}
      <div className="hidden md:block rounded-xl border border-border/70 bg-[#151821] p-2 sm:p-3 -mx-4 sm:mx-0">
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
                <TableCell className="capitalize align-top">{u.role}</TableCell>
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
    </div>
  )
}

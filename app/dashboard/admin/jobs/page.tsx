'use client'

import { useEffect, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchJsonCached } from '@/lib/client-fetch-cache'

type AdminJob = {
  id: string
  ownerId: string
  projectId: string
  shotType: string
  preset: string
  status: string
  attempts: number
  modelCalls: number
  maxAttempts: number
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<AdminJob[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchJsonCached<{ jobs?: AdminJob[] }>('admin-jobs', '/api/admin/jobs', { ttlMs: 12_000 })
      .then((data) => {
        setJobs(data.jobs ?? [])
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load jobs'))
  }, [])

  return (
    <div className="p-6 lg:p-8 space-y-4">
      <div className="rounded-xl border border-border/60 bg-[#0a0a0a] p-4 sm:p-5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Queue Jobs</h1>
        <p className="text-sm text-muted-foreground mt-1">Latest generation jobs and failure reasons.</p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="rounded-xl border border-border/70 bg-[#0a0a0a] p-2 sm:p-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Shot</TableHead>
            <TableHead>Preset</TableHead>
            <TableHead>Attempts</TableHead>
            <TableHead>Total Model Calls</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Error</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((j) => (
            <TableRow key={j.id}>
              <TableCell className="capitalize">{j.status}</TableCell>
              <TableCell>{j.shotType}</TableCell>
              <TableCell>{j.preset}</TableCell>
              <TableCell>{j.attempts}/{j.maxAttempts}</TableCell>
              <TableCell>{j.modelCalls}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{j.projectId}</TableCell>
              <TableCell className="text-xs">{j.errorMessage ?? '-'}</TableCell>
            </TableRow>
          ))}
          {jobs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">No jobs found.</TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      </div>
    </div>
  )
}

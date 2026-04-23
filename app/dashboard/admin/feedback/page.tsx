'use client'

import { useEffect, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { fetchJsonCached, invalidateJsonCache } from '@/lib/client-fetch-cache'

type FeedbackItem = {
  id: string
  userId: string | null
  userEmail: string | null
  pagePath: string | null
  message: string
  createdAt: string
}

const CACHE_KEY = 'admin-feedback'

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

export default function AdminFeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [openMessage, setOpenMessage] = useState<FeedbackItem | null>(null)

  async function load() {
    setError(null)
    try {
      const data = await fetchJsonCached<{ feedback?: FeedbackItem[] }>(CACHE_KEY, '/api/admin/feedback', {
        ttlMs: 15_000,
      })
      setItems(data.feedback ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load feedback')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const refresh = () => {
    invalidateJsonCache(CACHE_KEY)
    setLoading(true)
    void load()
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">User feedback</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Submissions from the floating feedback widget (newest first, up to 300).
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => refresh()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive mb-4" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No feedback yet.</p>
      ) : (
        <div className="rounded-md border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">When</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Page</TableHead>
                <TableHead className="min-w-[200px]">Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap align-top text-muted-foreground text-xs">
                    {formatWhen(row.createdAt)}
                  </TableCell>
                  <TableCell className="align-top text-xs">
                    <div className="max-w-[180px] break-words">
                      {row.userEmail ? (
                        <span className="text-foreground">{row.userEmail}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                    {row.userId ? (
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground break-all">{row.userId}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top text-xs max-w-[140px] break-all text-muted-foreground">
                    {row.pagePath ?? '—'}
                  </TableCell>
                  <TableCell className="align-top">
                    <button
                      type="button"
                      className="text-left text-xs text-foreground/90 hover:text-accent hover:underline line-clamp-3"
                      onClick={() => setOpenMessage(row)}
                    >
                      {row.message}
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={openMessage != null} onOpenChange={(o) => !o && setOpenMessage(null)}>
        <DialogContent className="sm:max-w-lg" showCloseButton>
          {openMessage ? (
            <>
              <DialogHeader>
                <DialogTitle>Feedback</DialogTitle>
                <DialogDescription>
                  {formatWhen(openMessage.createdAt)}
                  {openMessage.userEmail ? ` · ${openMessage.userEmail}` : ''}
                  {openMessage.pagePath ? ` · ${openMessage.pagePath}` : ''}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap break-words">
                {openMessage.message}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

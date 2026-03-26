'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Copy, Loader2, Link2Off, History, Trash2 } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

type ShareInfo = {
  token: string
  shareUrl: string
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
  revoked: boolean
  expired: boolean
}

type ShareAuditEntry = {
  id: string
  action: string
  actorId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

type ShareDialogProps = {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const EXPIRY_PRESETS = [
  { value: 'never', label: 'Never expires' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
] as const

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function getExpiresAtFromPreset(preset: string): string | null {
  if (preset === 'never') return null
  const d = new Date()
  if (preset === '24h') d.setHours(d.getHours() + 24)
  else if (preset === '7d') d.setDate(d.getDate() + 7)
  else if (preset === '30d') d.setDate(d.getDate() + 30)
  else if (preset === '90d') d.setDate(d.getDate() + 90)
  else return null
  return d.toISOString()
}

export function ShareDialog({ projectId, open, onOpenChange }: ShareDialogProps) {
  const [shares, setShares] = useState<ShareInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [expiryPreset, setExpiryPreset] = useState<string>('never')
  const [revoking, setRevoking] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [auditOpen, setAuditOpen] = useState<Record<string, boolean>>({})
  const [auditCache, setAuditCache] = useState<Record<string, ShareAuditEntry[]>>({})

  const fetchShares = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/shares`)
      const data = (await res.json()) as { shares?: ShareInfo[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to load shares')
      setShares(data.shares ?? [])
    } catch (e) {
      toast({
        title: 'Failed to load shares',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void fetchShares()
  }, [open, projectId])

  const createShare = async () => {
    if (creating) return
    setCreating(true)
    try {
      const expiresAt = getExpiresAtFromPreset(expiryPreset)
      const res = await fetch(`/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresAt }),
      })
      const data = (await res.json()) as { shareUrl?: string; error?: string }
      if (!res.ok || !data.shareUrl) {
        throw new Error(data.error ?? 'Failed to create share link')
      }
      await fetchShares()
      const canClipboard =
        typeof navigator !== 'undefined' &&
        !!navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      if (canClipboard) {
        await navigator.clipboard.writeText(data.shareUrl)
        toast({
          title: 'Share link copied',
          description: 'The link was copied to your clipboard.',
        })
      } else {
        toast({
          title: 'Share link created',
          description: (
            <span className="block max-w-full break-all [overflow-wrap:anywhere] font-mono text-xs">
              {data.shareUrl}
            </span>
          ),
        })
      }
    } catch (e) {
      toast({
        title: 'Share failed',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  const revokeShare = async (token: string) => {
    if (revoking) return
    setRevoking(token)
    try {
      const res = await fetch(`/api/shares/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke' }),
      })
      const data = (await res.json()) as { revoked?: boolean; error?: string }
      if (!res.ok || !data.revoked) {
        throw new Error(data.error ?? 'Failed to revoke')
      }
      await fetchShares()
      toast({ title: 'Share link revoked' })
    } catch (e) {
      toast({
        title: 'Revoke failed',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setRevoking(null)
    }
  }

  const deleteShare = async (token: string) => {
    if (deleting) return
    setDeleting(token)
    try {
      const res = await fetch(`/api/shares/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete' }),
      })
      const data = (await res.json()) as { deleted?: boolean; error?: string }
      if (!res.ok || !data.deleted) {
        throw new Error(data.error ?? 'Failed to delete')
      }
      await fetchShares()
      setAuditCache((prev) => {
        const next = { ...prev }
        delete next[token]
        return next
      })
      setAuditOpen((prev) => {
        const next = { ...prev }
        delete next[token]
        return next
      })
      toast({ title: 'Share link deleted' })
    } catch (e) {
      toast({
        title: 'Delete failed',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setDeleting(null)
    }
  }

  const copyLink = async (url: string) => {
    const canClipboard =
      typeof navigator !== 'undefined' &&
      !!navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    if (canClipboard) {
      await navigator.clipboard.writeText(url)
      toast({ title: 'Link copied' })
    } else {
      toast({
        title: 'Share link',
        description: (
          <span className="block max-w-full break-all [overflow-wrap:anywhere] font-mono text-xs">
            {url}
          </span>
        ),
      })
    }
  }

  const fetchAudit = async (token: string) => {
    if (auditCache[token]) return
    try {
      const res = await fetch(`/api/shares/${token}/audit`)
      const data = (await res.json()) as { audit?: ShareAuditEntry[]; error?: string }
      if (res.ok && data.audit) {
        setAuditCache((prev) => ({ ...prev, [token]: data.audit! }))
      }
    } catch {
      // Non-fatal
    }
  }

  const toggleAudit = (token: string) => {
    const next = !auditOpen[token]
    setAuditOpen((prev) => ({ ...prev, [token]: next }))
    if (next) void fetchAudit(token)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-w-[calc(100vw-2rem)] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Share links</DialogTitle>
          <DialogDescription>
            Create and manage share links. Revoked or expired links stop working immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Create new */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="w-full sm:w-40 space-y-2">
              <label className="text-sm font-medium">Expiration</label>
              <Select value={expiryPreset} onValueChange={setExpiryPreset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={createShare} disabled={creating} className="shrink-0">
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating…
                </>
              ) : (
                'Create link'
              )}
            </Button>
          </div>

          {/* List */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Existing links</h4>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading…
              </div>
            ) : shares.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No share links yet.</p>
            ) : (
              <ul className="space-y-2 max-h-64 overflow-y-auto">
                {shares.map((s) => (
                  <li
                    key={s.token}
                    className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                      <div className="min-w-0 w-full flex-1 overflow-hidden">
                        <code className="text-xs block w-full max-w-full break-all [overflow-wrap:anywhere] font-mono leading-snug text-muted-foreground">
                          {s.shareUrl}
                        </code>
                        <p className="text-xs text-muted-foreground mt-1">
                          Created {formatDate(s.createdAt)}
                          {s.expiresAt && (
                            <span>
                              {' • '}
                              Expires {formatDate(s.expiresAt)}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 self-end sm:self-start">
                        {!s.revoked && !s.expired && (
                          <>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => void copyLink(s.shareUrl)}
                              aria-label="Copy link"
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => void revokeShare(s.token)}
                              disabled={revoking === s.token}
                              aria-label="Revoke link"
                            >
                              {revoking === s.token ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Link2Off className="w-4 h-4" />
                              )}
                            </Button>
                          </>
                        )}
                        {s.revoked && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => void deleteShare(s.token)}
                            disabled={deleting === s.token}
                            aria-label="Delete revoked link"
                            className="text-destructive hover:text-destructive"
                          >
                            {deleting === s.token ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.revoked && (
                        <Badge variant="destructive" className="text-xs">
                          Revoked
                        </Badge>
                      )}
                      {s.expired && !s.revoked && (
                        <Badge variant="secondary" className="text-xs">
                          Expired
                        </Badge>
                      )}
                      {!s.revoked && !s.expired && (
                        <Badge variant="secondary" className="text-xs">
                          Active
                        </Badge>
                      )}
                      <Collapsible
                        open={!!auditOpen[s.token]}
                        onOpenChange={() => toggleAudit(s.token)}
                      >
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                          >
                            <History className="w-3 h-3" />
                            Audit
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-2 pt-2 border-t border-border">
                            {auditCache[s.token]?.length ? (
                              <ul className="space-y-1 text-xs text-muted-foreground">
                                {auditCache[s.token].map((a) => (
                                  <li key={a.id}>
                                    {a.action} — {formatDate(a.createdAt)}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                Loading audit…
                              </p>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { ArrowUpDown } from 'lucide-react'

type AdminProject = {
  id: string
  ownerEmail: string
  name: string
  generatedCount: number
  visualDirection: string
  pipeline: string
  renderStyleLevel?: string
  createdAt: string
  updatedAt: string
}

type SortKey = 'createdAt' | 'generatedCount'
type SortDirection = 'asc' | 'desc'

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<AdminProject[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [page, setPage] = useState(1)
  const pageSize = 20

  useEffect(() => {
    fetch('/api/admin/projects')
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { projects?: AdminProject[]; error?: string }
        if (!res.ok) throw new Error(data.error || 'Failed to load projects')
        setProjects(data.projects ?? [])
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load projects'))
  }, [])

  const sortedProjects = useMemo(() => {
    const copy = [...projects]
    copy.sort((a, b) => {
      if (sortKey === 'generatedCount') {
        return sortDirection === 'asc'
          ? a.generatedCount - b.generatedCount
          : b.generatedCount - a.generatedCount
      }
      const aTime = new Date(a.createdAt).getTime()
      const bTime = new Date(b.createdAt).getTime()
      return sortDirection === 'asc' ? aTime - bTime : bTime - aTime
    })
    return copy
  }, [projects, sortDirection, sortKey])

  const totalPages = Math.max(1, Math.ceil(sortedProjects.length / pageSize))
  const clampedPage = Math.min(page, totalPages)
  const pagedProjects = useMemo(() => {
    const start = (clampedPage - 1) * pageSize
    return sortedProjects.slice(start, start + pageSize)
  }, [clampedPage, sortedProjects])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection(key === 'createdAt' ? 'desc' : 'asc')
  }

  function formatPipelineLabel(pipeline: string, renderStyleLevel?: string): string {
    switch (pipeline) {
      case 'background_remove':
        return 'Background remover'
      case 'design_realize':
        return renderStyleLevel === 'photoreal_flatlay' ? 'Mockups to ProtoReal' : 'Sketch-to-3D Mockups'
      case 'garment_photo':
        return 'Product Shots'
      default:
        return pipeline || '—'
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-4">
      <div className="rounded-xl border border-border/60 bg-[#0a0a0a] p-4 sm:p-5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">All Projects</h1>
        <p className="text-sm text-muted-foreground mt-1">Recent projects across all accounts.</p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="rounded-xl border border-border/70 bg-[#0a0a0a] p-2 sm:p-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Owner Email</TableHead>
            <TableHead className="w-[260px]">Name</TableHead>
            <TableHead>Visual Direction</TableHead>
            <TableHead>Pipeline</TableHead>
            <TableHead>
              <button
                type="button"
                onClick={() => toggleSort('generatedCount')}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                Generated Assets
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </TableHead>
            <TableHead>
              <button
                type="button"
                onClick={() => toggleSort('createdAt')}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                Created
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </TableHead>
            <TableHead>Project ID</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedProjects.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="text-xs text-muted-foreground">
                <Link href={`/dashboard/admin/projects/${p.id}`} className="hover:underline">
                  {p.ownerEmail}
                </Link>
              </TableCell>
              <TableCell className="max-w-[260px] truncate" title={p.name}>
                <Link href={`/dashboard/admin/projects/${p.id}`} className="hover:underline">
                  {p.name}
                </Link>
              </TableCell>
              <TableCell className="capitalize">
                <Link href={`/dashboard/admin/projects/${p.id}`} className="hover:underline">
                  {p.visualDirection}
                </Link>
              </TableCell>
              <TableCell className="text-xs">
                <Link
                  href={`/dashboard/admin/projects/${p.id}`}
                  className="hover:underline capitalize"
                >
                  {formatPipelineLabel(p.pipeline, p.renderStyleLevel)}
                </Link>
              </TableCell>
              <TableCell>
                <Link href={`/dashboard/admin/projects/${p.id}`} className="hover:underline">
                  {p.generatedCount}
                </Link>
              </TableCell>
              <TableCell>
                <Link href={`/dashboard/admin/projects/${p.id}`} className="hover:underline">
                  {new Date(p.createdAt).toLocaleString()}
                </Link>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                <Link href={`/dashboard/admin/projects/${p.id}`} className="hover:underline">
                  {p.id}
                </Link>
              </TableCell>
            </TableRow>
          ))}
          {pagedProjects.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">No projects found.</TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
        <p className="text-xs text-muted-foreground">
          Showing {(clampedPage - 1) * pageSize + (pagedProjects.length ? 1 : 0)}-
          {(clampedPage - 1) * pageSize + pagedProjects.length} of {sortedProjects.length}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={clampedPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {clampedPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={clampedPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}

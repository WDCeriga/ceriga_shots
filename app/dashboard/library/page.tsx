'use client'

import { useProjects } from '@/hooks/use-projects'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from '@/hooks/use-toast'
import { Input } from '@/components/ui/input'
import type { Project } from '@/types/projects'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'

export default function LibraryPage() {
  const { projects, deleteProject, isLoading, updateProject } = useProjects()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'newest' | 'oldest' | 'name'>('newest')
  const projectToDelete = deleteId
    ? projects.find((p) => p.id === deleteId) ?? null
    : null
  const projectToRename = renameId ? projects.find((p) => p.id === renameId) ?? null : null

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8">
          <div className="space-y-2">
            <div className="h-8 w-56 rounded-md bg-secondary/60" />
            <div className="h-4 w-72 rounded-md bg-secondary/50" />
          </div>
          <div className="h-9 w-40 rounded-md bg-secondary/60" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="rounded-xl border border-border overflow-hidden bg-card">
              <div className="aspect-square bg-secondary/50" />
              <div className="p-4 space-y-2">
                <div className="h-4 w-2/3 rounded-md bg-secondary/60" />
                <div className="h-3 w-1/2 rounded-md bg-secondary/50" />
              </div>
              <div className="p-4 pt-0 flex gap-2">
                <div className="h-8 flex-1 rounded-md bg-secondary/60" />
                <div className="h-8 w-20 rounded-md bg-secondary/60" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const normalizedQuery = query.trim().toLowerCase()

  const getProjectType = (project: Project) => {
    const pipeline = project.generation?.pipeline
    if (pipeline === 'design_realize') {
      return { label: 'Sketch-to-3D', className: 'border-red-500/35 bg-red-500/10 text-red-400' }
    }
    if (pipeline === 'garment_photo') {
      return { label: 'Product Shots', className: 'border-border bg-secondary/30 text-muted-foreground' }
    }
    // If older projects don't have generation info, assume product-shot style.
    return { label: 'Product Shots', className: 'border-border bg-secondary/30 text-muted-foreground' }
  }

  const filtered = projects
    .filter((p) => {
      if (!normalizedQuery) return true
      return (
        p.name.toLowerCase().includes(normalizedQuery) ||
        p.originalImageName.toLowerCase().includes(normalizedQuery)
      )
    })
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'oldest') return a.createdAt - b.createdAt
      return b.createdAt - a.createdAt
    })

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8 space-y-5 rounded-xl border border-border/60 bg-[#12141a] p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Project Library</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Browse, open, and manage your generated assets.
            </p>
          </div>

          <Link href="/dashboard/generate">
            <Button className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </Link>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-lg">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by project name or filename…"
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground hidden sm:block">
              {filtered.length} of {projects.length}
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="name">Name</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-[#151821]">
          <div className="px-6 py-16 text-center max-w-lg mx-auto">
            <div className="mx-auto w-12 h-12 rounded-xl border border-border bg-secondary/50 flex items-center justify-center mb-4">
              <Plus className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">No projects yet</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Create a project to start generating flat lays, product shots, detail shots, and lifestyle scenes.
            </p>
            <Link href="/dashboard/generate" className="inline-block mt-6">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create your first project
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <>
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-border bg-[#151821] p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No results for <span className="font-medium text-foreground">“{query.trim()}”</span>.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => setQuery('')}>
                Clear search
              </Button>
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filtered.map((project) => (
            <div
              key={project.id}
              className="rounded-xl border border-border overflow-hidden bg-[#151821] hover:border-accent transition-colors group"
            >
              <Link
                href={`/dashboard/results/${project.id}`}
                aria-label={`Open project ${project.name}`}
                className="block focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <div className="relative aspect-square overflow-hidden bg-secondary/20">
                  <img
                    src={project.originalImage}
                    alt={project.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/80 to-transparent" />
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{project.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {project.originalImageName}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span
                        className={[
                          'rounded-full border px-2 py-1 text-[11px]',
                          getProjectType(project).className,
                        ].join(' ')}
                      >
                        {getProjectType(project).label}
                      </span>
                      <span className="rounded-full border border-border bg-secondary/30 px-2 py-1 text-[11px] text-muted-foreground">
                        {project.generatedCount ?? project.generatedImages.length} assets
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(project.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </Link>

              <div className="px-4 pb-4">
                <div className="flex gap-2">
                  <Link className="flex-1" href={`/dashboard/results/${project.id}`}>
                    <Button size="sm" variant="outline" className="w-full">
                      View
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRenameId(project.id)
                      setRenameDraft(project.name)
                    }}
                    aria-label={`Rename project ${project.name}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => setDeleteId(project.id)}
                    aria-label={`Delete project ${project.name}`}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
            ))}
          </div>
        </>
      )}

      <Dialog
        open={renameId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenameId(null)
            setRenameDraft('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>
              Choose a clear name so it’s easy to find later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-sm font-medium">Name</div>
            <Input
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const next = renameDraft.trim()
                  if (!next || !projectToRename) return
                  updateProject(projectToRename.id, { name: next })
                    .then(() => {
                      toast({ title: 'Project renamed' })
                      setRenameId(null)
                      setRenameDraft('')
                    })
                    .catch((err) => {
                      toast({
                        title: 'Rename failed',
                        description: err instanceof Error ? err.message : 'Please try again.',
                        variant: 'destructive',
                      })
                    })
                }
              }}
              placeholder="e.g. Spring drop — hoodie"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenameId(null)
                setRenameDraft('')
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const next = renameDraft.trim()
                if (!next || !projectToRename) return
                updateProject(projectToRename.id, { name: next })
                  .then(() => {
                    toast({ title: 'Project renamed' })
                    setRenameId(null)
                    setRenameDraft('')
                  })
                  .catch((err) => {
                    toast({
                      title: 'Rename failed',
                      description: err instanceof Error ? err.message : 'Please try again.',
                      variant: 'destructive',
                    })
                  })
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              {projectToDelete
                ? `This will permanently delete “${projectToDelete.name}” from this device.`
                : 'This will permanently delete this project from this device.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteId) return
                deleteProject(deleteId)
                setDeleteId(null)
                toast({
                  title: 'Project deleted',
                })
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

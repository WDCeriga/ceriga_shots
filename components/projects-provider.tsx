'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Project } from '@/types/projects'

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

type ProjectsContextValue = {
  projects: Project[]
  isLoading: boolean
  addProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Project>
  updateProject: (id: string, updates: Partial<Project>) => Promise<Project>
  deleteProject: (id: string) => void
  getProject: (id: string) => Project | undefined
  fetchProject: (id: string) => Promise<Project | null>
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null)

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const upsertProject = useCallback((project: Project) => {
    setProjects((prev) => {
      const idx = prev.findIndex((p) => p.id === project.id)
      if (idx === -1) return [project, ...prev]
      const next = [...prev]
      next[idx] = project
      return next
    })
  }, [])

  // Load once for the whole dashboard session
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/projects', { method: 'GET' })
        if (!res.ok) throw new Error(`Failed to load projects: ${res.status}`)
        const data = (await res.json()) as { projects: Project[] }
        if (!cancelled) setProjects(data.projects ?? [])
      } catch (error) {
        console.error('Failed to load projects:', error)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const addProject = useCallback(
    async (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> => {
      const now = Date.now()
      const optimistic: Project = {
        ...project,
        id: `temp-${now}`,
        createdAt: now,
        updatedAt: now,
      }
      setProjects((prev) => [optimistic, ...prev])

      try {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(project),
        })
        if (!res.ok) {
          if (res.status === 401) {
            throw new HttpError(401, 'You must be logged in to generate content.')
          }
          throw new HttpError(res.status, `Failed to create project: ${res.status}`)
        }
        const data = (await res.json()) as { project: Project }
        setProjects((prev) => prev.map((p) => (p.id === optimistic.id ? data.project : p)))
        return data.project
      } catch (error) {
        console.error('Failed to create project:', error)
        setProjects((prev) => prev.filter((p) => p.id !== optimistic.id))
        throw error
      }
    },
    []
  )

  const updateProject = useCallback(async (id: string, updates: Partial<Project>): Promise<Project> => {
    let before: Project | undefined
    const now = Date.now()

    setProjects((prev) => {
      before = prev.find((p) => p.id === id)
      return prev.map((p) => (p.id === id ? { ...p, ...updates, updatedAt: now } : p))
    })

    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) {
        const message = await res.text().catch(() => '')
        throw new HttpError(res.status, message || `Failed to update project: ${res.status}`)
      }
      const data = (await res.json()) as { project: Project }
      if (!data.project) throw new Error('Invalid response from server')
      setProjects((prev) => prev.map((p) => (p.id === id ? data.project : p)))
      return data.project
    } catch (error) {
      console.error('Failed to update project:', error)
      if (before) setProjects((prev) => prev.map((p) => (p.id === id ? before : p)))
      throw error
    }
  }, [])

  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id))

    ;(async () => {
      try {
        const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error(`Failed to delete project: ${res.status}`)
      } catch (error) {
        console.error('Failed to delete project:', error)
      }
    })()
  }, [])

  const getProject = useCallback((id: string) => projects.find((p) => p.id === id), [projects])

  const fetchProject = useCallback(
    async (id: string): Promise<Project | null> => {
      try {
        const res = await fetch(`/api/projects/${id}`, { method: 'GET' })
        if (res.status === 404) return null
        if (!res.ok) throw new Error(`Failed to load project: ${res.status}`)
        const data = (await res.json()) as { project: Project }
        if (data.project) upsertProject(data.project)
        return data.project ?? null
      } catch (error) {
        console.error('Failed to load project:', error)
        throw error
      }
    },
    [upsertProject]
  )

  const value = useMemo<ProjectsContextValue>(
    () => ({
      projects,
      isLoading,
      addProject,
      updateProject,
      deleteProject,
      getProject,
      fetchProject,
    }),
    [projects, isLoading, addProject, updateProject, deleteProject, getProject, fetchProject]
  )

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>
}

export function useProjectsContext() {
  const ctx = useContext(ProjectsContext)
  if (!ctx) throw new Error('useProjects must be used within <ProjectsProvider />')
  return ctx
}


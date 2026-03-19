'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useProjects } from '@/hooks/use-projects'
import { toast } from '@/hooks/use-toast'

function ProjectCardSkeleton() {
  return (
    <div className="border border-border rounded-lg overflow-hidden animate-pulse">
      <div className="aspect-square bg-secondary" />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-secondary rounded w-3/4" />
        <div className="h-3 bg-secondary rounded w-1/3" />
      </div>
    </div>
  )
}

export default function DashboardHome() {
  const { projects, isLoading } = useProjects()
  const searchParams = useSearchParams()

  useEffect(() => {
    const verified = searchParams.get('verified')
    if (verified === 'true') {
      toast({
        title: 'Email verified',
        description: 'Your email has been verified. You can now generate content.',
      })
    } else if (verified === 'expired') {
      toast({
        title: 'Link expired',
        description: 'Your verification link has expired. Please request a new one.',
        variant: 'destructive',
      })
    } else if (verified === 'invalid') {
      toast({
        title: 'Invalid link',
        description: 'The verification link is invalid. Please request a new one.',
        variant: 'destructive',
      })
    }
  }, [searchParams])

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-12">
        <h1 className="text-4xl font-bold mb-4 text-balance">Welcome to Ceriga Shots</h1>
        <p className="text-lg text-muted-foreground mb-8">Create AI-generated product content for your designs in seconds.</p>
        
        <div className="grid grid-cols-3 gap-6">
          <Link href="/dashboard/generate">
            <Button variant="outline" className="w-full h-32 flex flex-col items-center justify-center gap-3 text-center">
              <div className="text-3xl">+</div>
              <div>
                <div className="font-semibold">Create New</div>
                <div className="text-xs text-muted-foreground">Start generating content</div>
              </div>
            </Button>
          </Link>

          <div className="border border-border rounded-lg p-6 flex flex-col items-center justify-center gap-2 text-center">
            {isLoading ? (
              <div className="h-8 w-10 bg-secondary rounded animate-pulse" />
            ) : (
              <div className="text-2xl font-bold">{projects.length}</div>
            )}
            <div className="text-sm text-muted-foreground">Projects Created</div>
          </div>

          <Link href="/dashboard/library">
            <Button variant="outline" className="w-full h-32 flex flex-col items-center justify-center gap-3 text-center">
              <div className="text-3xl">→</div>
              <div>
                <div className="font-semibold">View Library</div>
                <div className="text-xs text-muted-foreground">All your projects</div>
              </div>
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div>
          <h2 className="text-2xl font-bold mb-6">Recent Projects</h2>
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <ProjectCardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : projects.length > 0 ? (
        <div>
          <h2 className="text-2xl font-bold mb-6">Recent Projects</h2>
          <div className="grid grid-cols-4 gap-4">
            {projects.slice(0, 4).map((project) => (
              <Link key={project.id} href={`/dashboard/results/${project.id}`}>
                <div className="border border-border rounded-lg overflow-hidden hover:border-accent transition-colors cursor-pointer">
                  <div className="aspect-square bg-secondary overflow-hidden">
                    <img
                      src={project.originalImage}
                      alt={project.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-4">
                    <p className="font-medium truncate">{project.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {project.generatedImages.length} assets
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

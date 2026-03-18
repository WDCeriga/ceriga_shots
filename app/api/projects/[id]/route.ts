import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { deleteProjectForUser, getProjectForUser, updateProjectForUser } from '@/lib/projects'
import type { Project } from '@/hooks/use-projects'

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const url = new URL(_req.url)
  const id = url.pathname.split('/').pop() as string
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const project = await getProjectForUser(session.user.id, id)
    if (!project) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ project })
  } catch (error) {
    console.error('GET /api/projects/[id] error', error)
    return NextResponse.json({ error: 'Failed to load project' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url)
  const id = url.pathname.split('/').pop() as string
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates = body as Partial<Project>

  try {
    const project = await updateProjectForUser(session.user.id, id, updates)
    if (!project) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ project })
  } catch (error) {
    console.error('PATCH /api/projects/[id] error', error)
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest): Promise<NextResponse> {
  const url = new URL(_req.url)
  const id = url.pathname.split('/').pop() as string
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await deleteProjectForUser(session.user.id, id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/projects/[id] error', error)
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}


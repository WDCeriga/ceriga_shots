import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { findUserById, updateUserBrandName } from '@/lib/users'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await findUserById(userId)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      brandName: user.brand_name,
      role: user.role,
    },
  })
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const brandNameRaw = (body as { brandName?: unknown }).brandName
  const brandName = typeof brandNameRaw === 'string' ? brandNameRaw : null
  if (brandName != null && brandName.trim().length > 80) {
    return NextResponse.json({ error: 'Brand name must be 80 characters or less.' }, { status: 400 })
  }

  const updated = await updateUserBrandName(userId, brandName)
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    user: {
      id: updated.id,
      email: updated.email,
      brandName: updated.brand_name,
      role: updated.role,
    },
  })
}


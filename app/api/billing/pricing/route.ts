import { NextResponse } from 'next/server'
import { getDisplayedPriceForRoleCycle } from '@/lib/billing'

export const runtime = 'nodejs'

type Role = 'starter' | 'studio' | 'label'
type Cycle = 'monthly' | 'yearly'

type PricingPayload = {
  prices: Record<Role, Record<Cycle, number | null>>
  source: 'code'
}

const ROLES: Role[] = ['starter', 'studio', 'label']
const CYCLES: Cycle[] = ['monthly', 'yearly']

function emptyPayload(): PricingPayload {
  return {
    source: 'code',
    prices: {
      starter: { monthly: null, yearly: null },
      studio: { monthly: null, yearly: null },
      label: { monthly: null, yearly: null },
    },
  }
}

export async function GET() {
  const payload = emptyPayload()
  for (const role of ROLES) {
    for (const cycle of CYCLES) {
      payload.prices[role][cycle] = getDisplayedPriceForRoleCycle(role, cycle)
    }
  }

  return NextResponse.json(payload)
}

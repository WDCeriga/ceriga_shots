import type { Metadata } from 'next'
import { DashboardPricingClient } from '@/components/dashboard-pricing-client'

export const metadata: Metadata = {
  title: 'Pricing',
}

export default function PricingPage() {
  return <DashboardPricingClient />
}

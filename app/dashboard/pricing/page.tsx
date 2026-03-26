import type { Metadata } from 'next'

import { DashboardSubscriptionManagementClient } from '@/components/dashboard-subscription-management-client'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Ceriga Shots plans and pricing — manage your subscription in the dashboard.',
}

export default function DashboardPricingPage() {
  return <DashboardSubscriptionManagementClient />
}

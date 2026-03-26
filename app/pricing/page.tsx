import type { Metadata } from 'next'

import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/cta-footer'
import { DashboardPricingClient } from '@/components/dashboard-pricing-client'

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Ceriga Shots plans and pricing — pick the tier that matches your content volume and scale when your brand grows.',
}

export default function PricingPage() {
  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      <section className="pt-20 border-t border-border">
        <DashboardPricingClient />
      </section>
      <Footer />
    </main>
  )
}

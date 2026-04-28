import type { Metadata } from 'next'

import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/cta-footer'

export const metadata: Metadata = {
  title: 'Refund Policy',
  description: 'Refund policy for Ceriga Shots plans and credits.',
}

export default function RefundsPage() {
  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      <section className="py-24 border-t border-border">
        <div className="max-w-3xl mx-auto px-6 lg:px-12 space-y-6">
          <h1 className="text-4xl font-black tracking-tight">Refund Policy</h1>
          <p className="text-muted-foreground">
            This Refund Policy explains how Ceriga Shots handles refunds for subscriptions, one-time purchases, and
            usage credits.
          </p>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">General policy</h2>
            <p className="text-muted-foreground">
              Payments are generally non-refundable once services are delivered or credits are consumed, except where
              required by law. We review refund requests in good faith on a case-by-case basis.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Subscription cancellations</h2>
            <p className="text-muted-foreground">
              You can cancel a subscription at any time before the next renewal date to avoid future charges.
              Cancellations take effect at the end of the current billing period unless otherwise stated.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Billing errors and duplicate charges</h2>
            <p className="text-muted-foreground">
              If you believe there is an incorrect or duplicate charge, contact support promptly with your invoice and
              account details so we can investigate and resolve the issue.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">How to request a refund review</h2>
            <p className="text-muted-foreground">
              Submit refund requests through support and include your account email, payment date, transaction details,
              and a brief explanation. We may ask for additional information to process your request.
            </p>
          </div>

          <p className="text-sm text-muted-foreground">Last updated: 2026-04-28.</p>
        </div>
      </section>
      <Footer />
    </main>
  )
}

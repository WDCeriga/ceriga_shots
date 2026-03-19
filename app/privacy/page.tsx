import type { Metadata } from 'next'

import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/cta-footer'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy policy for Ceriga Shots, including how we handle data and cookies.',
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar />
      <section className="py-24 border-t border-border">
        <div className="max-w-3xl mx-auto px-6 lg:px-12 space-y-6">
          <h1 className="text-4xl font-black tracking-tight">Privacy Policy</h1>
          <p className="text-muted-foreground">
            Ceriga Shots is committed to protecting your privacy. This policy explains how we
            collect, use, and share information when you use the service.
          </p>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">What we collect</h2>
            <p className="text-muted-foreground">
              Typically, authentication data (email), account/profile information, and usage data related
              to generating and delivering content.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">How we use it</h2>
            <p className="text-muted-foreground">
              To provide the service, secure accounts, prevent abuse, and improve performance.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Third parties</h2>
            <p className="text-muted-foreground">
              Your service may use third-party providers for auth, storage, analytics, and billing.
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            Last updated: {new Date().toISOString().slice(0, 10)}.
          </p>
        </div>
      </section>
      <Footer />
    </main>
  )
}


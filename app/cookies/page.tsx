import type { Metadata } from 'next'

import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/cta-footer'

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'Cookie policy for Ceriga Shots.',
}

export default function CookiesPage() {
  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      <section className="py-24 border-t border-border">
        <div className="max-w-3xl mx-auto px-6 lg:px-12 space-y-6">
          <h1 className="text-4xl font-black tracking-tight">Cookie Policy</h1>
          <p className="text-muted-foreground">
            Ceriga Shots uses cookies and similar technologies to run core features, keep accounts secure, and improve
            performance and user experience.
          </p>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Essential cookies</h2>
            <p className="text-muted-foreground">
              These cookies are required for core operations such as authentication, security checks, fraud prevention,
              and keeping you signed in. The site may not function correctly without them.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Analytics and performance cookies</h2>
            <p className="text-muted-foreground">
              We may use analytics technologies to understand aggregate traffic and usage patterns. This helps us
              improve reliability, speed, and product quality.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Third-party technologies</h2>
            <p className="text-muted-foreground">
              Some cookies may be set by trusted third-party providers that support hosting, analytics, authentication,
              or billing functionality.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Managing cookies</h2>
            <p className="text-muted-foreground">
              Most browsers let you manage or block cookies through settings. Disabling cookies can affect account
              access and other functionality.
            </p>
          </div>

          <p className="text-sm text-muted-foreground">Last updated: 2026-04-28.</p>
        </div>
      </section>
      <Footer />
    </main>
  )
}

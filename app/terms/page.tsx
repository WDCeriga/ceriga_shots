import type { Metadata } from 'next'

import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/cta-footer'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for Ceriga Shots.',
}

export default function TermsPage() {
  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      <section className="py-24 border-t border-border">
        <div className="max-w-3xl mx-auto px-6 lg:px-12 space-y-6">
          <h1 className="text-4xl font-black tracking-tight">Terms of Service</h1>
          <p className="text-muted-foreground">
            These Terms of Service govern your access to and use of Ceriga Shots. By creating an account or using the
            service, you agree to these terms.
          </p>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Eligibility and account responsibilities</h2>
            <p className="text-muted-foreground">
              You must provide accurate account information and keep your credentials secure. You are responsible for
              all activity under your account and for ensuring your use of the platform complies with applicable laws.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Permitted use</h2>
            <p className="text-muted-foreground">
              You may use Ceriga Shots for lawful business and creative work. You may not use the service for abusive,
              fraudulent, infringing, or otherwise unlawful activity, including attempts to disrupt, reverse engineer,
              or misuse the platform.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Billing, subscriptions, and credits</h2>
            <p className="text-muted-foreground">
              Paid plans, credits, and other paid features are billed based on the pricing shown at checkout. Unless
              otherwise stated, charges are non-refundable except where required by law or covered by our Refund
              Policy.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Content and intellectual property</h2>
            <p className="text-muted-foreground">
              You retain ownership of content you upload. You represent that you have all rights needed to upload and
              process that content. You grant Ceriga Shots a limited license to host, process, and transform content
              solely to provide and improve the service.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Availability and changes</h2>
            <p className="text-muted-foreground">
              We may update features, pricing, and these terms from time to time. We may suspend or terminate access
              for security, abuse, legal compliance, or material violations of these terms.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Disclaimers and limitation of liability</h2>
            <p className="text-muted-foreground">
              The service is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the fullest extent permitted by law,
              Ceriga Shots disclaims implied warranties and is not liable for indirect, incidental, special, or
              consequential damages.
            </p>
          </div>

          <p className="text-sm text-muted-foreground">Last updated: 2026-04-28.</p>
        </div>
      </section>
      <Footer />
    </main>
  )
}

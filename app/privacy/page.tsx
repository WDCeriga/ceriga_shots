import type { Metadata } from 'next'

import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/cta-footer'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy policy for Ceriga Shots, including how we handle data and cookies.',
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      <section className="py-24 border-t border-border">
        <div className="max-w-3xl mx-auto px-6 lg:px-12 space-y-6">
          <h1 className="text-4xl font-black tracking-tight">Privacy Policy</h1>
          <p className="text-muted-foreground">
            This Privacy Policy explains what personal information Ceriga Shots collects, how we use it, and the
            choices available to you when you use our website and services.
          </p>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Information we collect</h2>
            <p className="text-muted-foreground">
              We may collect account information (such as email and profile details), transaction and billing metadata,
              uploaded assets, generated outputs, device information, and usage analytics needed to operate and improve
              the service.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">How we use information</h2>
            <p className="text-muted-foreground">
              We use information to provide core functionality, secure accounts, process billing, prevent fraud or
              abuse, respond to support requests, and improve product reliability and performance.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Sharing with service providers</h2>
            <p className="text-muted-foreground">
              We share information with trusted subprocessors that help us deliver the service, such as hosting,
              authentication, storage, analytics, and payment providers. They may process data only on our behalf and
              for legitimate business purposes.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Data retention</h2>
            <p className="text-muted-foreground">
              We retain data for as long as needed to provide the service, comply with legal obligations, resolve
              disputes, and enforce agreements. Retention periods may vary by data type and account status.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Your rights and choices</h2>
            <p className="text-muted-foreground">
              Depending on your location, you may have rights to access, correct, delete, or export personal data. You
              may also object to or limit certain processing. To submit a request, contact support from your account
              email.
            </p>
          </div>

          <p className="text-sm text-muted-foreground">Last updated: 2026-04-28.</p>
        </div>
      </section>
      <Footer />
    </main>
  )
}


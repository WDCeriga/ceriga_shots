import type { Metadata } from 'next'
import Link from 'next/link'

import { Navbar } from '@/components/navbar'
import { GallerySection } from '@/components/gallery-section'
import { HowItWorks } from '@/components/how-it-works'
import { PricingSection } from '@/components/pricing-section'
import { Footer } from '@/components/cta-footer'

export const metadata: Metadata = {
  title: 'AI Product Shots',
  description:
    'Generate AI product shots for clothing brands: multiple angles, detail views, and lifestyle-ready compositions.',
}

export default function AiProductShotsPage() {
  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <section className="pt-24 pb-16 border-t border-border">
        <div className="max-w-3xl mx-auto px-6 lg:px-12">
          <div className="space-y-6">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-balance">
              AI Product Shots for Clothing Brands
            </h1>

            <p className="text-muted-foreground text-lg leading-relaxed">
              Create professional-looking product imagery without a photoshoot. Ceriga generates AI
              product shots across angles, surfaces, and detail close-ups—so your ecommerce listings
              stay fresh and consistent.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 bg-foreground text-background text-sm font-semibold tracking-wider uppercase px-8 py-4 hover:bg-accent hover:text-foreground transition-all duration-300"
              >
                Upload Your Design
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 border border-border text-foreground text-sm font-medium tracking-wider uppercase px-8 py-4 hover:border-foreground transition-all duration-300"
              >
                See How It Works
              </Link>
            </div>

            <ul className="grid gap-3 sm:grid-cols-2">
              <li className="flex items-start gap-3 text-sm">
                <span className="w-2 h-2 bg-accent mt-2 rounded-full flex-shrink-0" />
                Multiple product angles and compositions
              </li>
              <li className="flex items-start gap-3 text-sm">
                <span className="w-2 h-2 bg-accent mt-2 rounded-full flex-shrink-0" />
                Detail shots (prints, fabric texture, collar close-ups)
              </li>
              <li className="flex items-start gap-3 text-sm">
                <span className="w-2 h-2 bg-accent mt-2 rounded-full flex-shrink-0" />
                Surface styles (hanging and draped looks)
              </li>
              <li className="flex items-start gap-3 text-sm">
                <span className="w-2 h-2 bg-accent mt-2 rounded-full flex-shrink-0" />
                One content pack: images + exports for sharing
              </li>
            </ul>

            <div className="pt-2 text-sm text-muted-foreground">
              Prefer flat lays or motion clips?{' '}
              <Link className="underline underline-offset-2 text-foreground hover:text-accent" href="/dashboard">
                Generate flat lays
              </Link>{' '}
              and{' '}
              <Link
                className="underline underline-offset-2 text-foreground hover:text-accent"
                href="/ai-fashion-video-generator"
              >
                AI fashion video clips
              </Link>
              .
            </div>
          </div>
        </div>
      </section>

      <HowItWorks />
      <GallerySection />
      <PricingSection />
      <Footer />
    </main>
  )
}


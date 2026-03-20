import type { Metadata } from 'next'
import Link from 'next/link'

import { Navbar } from '@/components/navbar'
// import { VideoSection } from '@/components/video-section'
import { HowItWorks } from '@/components/how-it-works'
import { GallerySection } from '@/components/gallery-section'
import { PricingSection } from '@/components/pricing-section'
import { Footer } from '@/components/cta-footer'

export const metadata: Metadata = {
  title: 'AI Fashion Video Clips',
  description:
    'Turn your product images into motion-ready AI video clips for TikTok, Instagram Reels, and Stories.',
}

export default function AiFashionVideoGeneratorPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar />

      <section className="pt-24 pb-16 border-t border-border">
        <div className="max-w-3xl mx-auto px-6 lg:px-12">
          <div className="space-y-6">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-balance">
              AI Fashion Video Clips for TikTok & Reels
            </h1>

            <p className="text-muted-foreground text-lg leading-relaxed">
              Upload your product design and generate AI motion clips optimized for TikTok, Instagram
              Reels, and Stories. No editing workflows—just subtle zoom, parallax, and ready-to-post
              exports.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/dashboard/generate"
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
                Auto-formatted for each social platform
              </li>
              <li className="flex items-start gap-3 text-sm">
                <span className="w-2 h-2 bg-accent mt-2 rounded-full flex-shrink-0" />
                Subtle zoom, parallax, and motion effects
              </li>
              <li className="flex items-start gap-3 text-sm">
                <span className="w-2 h-2 bg-accent mt-2 rounded-full flex-shrink-0" />
                Ready-to-post clips with no editing needed
              </li>
              <li className="flex items-start gap-3 text-sm">
                <span className="w-2 h-2 bg-accent mt-2 rounded-full flex-shrink-0" />
                One content pack: videos + images
              </li>
            </ul>

            <div className="pt-2 text-sm text-muted-foreground">
              Also generate{' '}
              <Link className="underline underline-offset-2 text-foreground hover:text-accent" href="/ai-flat-lay-generator">
                AI flat lays
              </Link>{' '}
              and{' '}
              <Link className="underline underline-offset-2 text-foreground hover:text-accent" href="/ai-product-shots">
                AI product shots
              </Link>
              .
            </div>
          </div>
        </div>
      </section>

      {/* <VideoSection /> */}
      <HowItWorks />
      <GallerySection />
      <PricingSection />
      <Footer />
    </main>
  )
}


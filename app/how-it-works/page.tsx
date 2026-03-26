import type { Metadata } from 'next'

import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/cta-footer'
import { HowItWorks } from '@/components/how-it-works'
import { HowItWorksHero } from '@/components/how-it-works-hero'
import { StylePresetsSection } from '@/components/style-presets-section'
import { CommonQuestionsSection } from '@/components/common-questions-section'

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'Upload your clothing design, get AI-generated flat lays, angles, lifestyle shots, and video clips in under a minute — then download your full content pack.',
}

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      <div className="pt-16">
        <HowItWorksHero />
        <HowItWorks />
        <StylePresetsSection />
        <CommonQuestionsSection />
      </div>
      <Footer />
    </main>
  )
}

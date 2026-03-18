import { Navbar } from "@/components/navbar"
import { HeroSection } from "@/components/hero-section"
import { VideoSection } from "@/components/video-section"
import { HowItWorks } from "@/components/how-it-works"
import { GallerySection } from "@/components/gallery-section"
import { PricingSection } from "@/components/pricing-section"
import { CtaSection, Footer } from "@/components/cta-footer"

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar />
      <HeroSection />
      <VideoSection />
      <HowItWorks />
      <GallerySection />
      <PricingSection />
      <CtaSection />
      <Footer />
    </main>
  )
}

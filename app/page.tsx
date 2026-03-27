import { Navbar } from "@/components/navbar"
import { HeroSection } from "@/components/hero-section"
// import { VideoSection } from "@/components/video-section"
import { HomeTechnicalSuperiority } from "@/components/home-technical-superiority"
import { GallerySection } from "@/components/gallery-section"
import { PricingSection } from "@/components/pricing-section"
import { CommonQuestionsSection } from "@/components/common-questions-section"
import { CtaSection, Footer } from "@/components/cta-footer"

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      <HeroSection />
      {/* <VideoSection /> */}
      <HomeTechnicalSuperiority />
      <GallerySection />
      <PricingSection />
      <CommonQuestionsSection />
      <CtaSection />
      <Footer />
    </main>
  )
}

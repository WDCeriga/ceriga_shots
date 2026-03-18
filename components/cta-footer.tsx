import Link from "next/link"
import { ArrowRight, Instagram } from "lucide-react"

export function CtaSection() {
  return (
    <section className="py-40 border-t border-border relative overflow-hidden">
      {/* Background accent */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
        <span className="text-[20rem] font-black text-foreground/[0.02] leading-none tracking-tighter">
          AI
        </span>
      </div>

      <div className="relative max-w-7xl mx-auto px-6 lg:px-12 flex flex-col items-center text-center">
        <span className="flex items-center gap-3 mb-8">
          <span className="w-6 h-px bg-accent" />
          <span className="text-accent text-xs tracking-[0.3em] uppercase font-medium">Ready to ship?</span>
          <span className="w-6 h-px bg-accent" />
        </span>

        <h2 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight text-foreground text-balance mb-8 max-w-3xl">
          Generate your campaign now.
        </h2>
        <p className="text-muted-foreground text-lg leading-relaxed max-w-md mb-12">
          Join hundreds of clothing brands creating professional content without a single photoshoot.
        </p>

        <Link
          href="/dashboard/generate"
          className="inline-flex items-center gap-3 bg-foreground text-background text-sm font-semibold tracking-wider uppercase px-10 py-5 hover:bg-accent hover:text-foreground transition-all duration-300 group"
        >
          Upload Your Design
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-border py-12">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 flex flex-col sm:flex-row items-center justify-between gap-6">
        <Link href="/" className="text-foreground text-sm font-semibold tracking-[0.2em] uppercase">
          Ceriga<span className="text-accent">.</span>
        </Link>

        <nav className="flex items-center gap-8">
          {[
            { label: "Pricing", href: "#pricing" },
            { label: "About", href: "#" },
            { label: "Contact", href: "#" },
            { label: "Privacy", href: "#" },
          ].map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-xs text-muted-foreground hover:text-foreground tracking-widest uppercase transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <Link href="#" aria-label="Instagram" className="text-muted-foreground hover:text-foreground transition-colors">
            <Instagram className="w-4 h-4" />
          </Link>
          <span className="text-xs text-muted-foreground">© 2025 Ceriga</span>
        </div>
      </div>
    </footer>
  )
}

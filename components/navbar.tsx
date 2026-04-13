"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Menu, X } from "lucide-react"

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const closeOnResize = () => {
      if (window.innerWidth >= 768) setMobileOpen(false)
    }
    window.addEventListener("resize", closeOnResize)
    return () => window.removeEventListener("resize", closeOnResize)
  }, [])

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 h-16">
        <div className="relative flex h-full items-center justify-between">
          <Link href="/" className="text-foreground text-sm font-semibold tracking-[0.2em] uppercase shrink-0">
            Ceriga Shots<span className="text-accent">.</span>
          </Link>

          <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-8">
            <Link
              href="/how-it-works"
              className="text-xs tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors duration-300"
            >
              How it works
            </Link>
            <Link
              href="/features"
              className="text-xs tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors duration-300"
            >
              Features
            </Link>
            <Link
              href="/pricing"
              className="text-xs tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors duration-300"
            >
              Pricing
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-secondary transition-colors"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <Link
              href="/dashboard"
              className="text-[10px] sm:text-xs tracking-widest uppercase bg-foreground text-background px-3 sm:px-5 py-2 sm:py-2.5 hover:bg-accent hover:text-foreground transition-colors duration-300 shrink-0"
              onClick={() => setMobileOpen(false)}
            >
              <span className="hidden sm:inline">Launch Studio</span>
              <span className="sm:hidden">Launch</span>
            </Link>
          </div>
        </div>
      </nav>

      {mobileOpen ? (
        <div className="md:hidden border-t border-border bg-background">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-1">
            {[
              { label: "How it works", href: "/how-it-works" },
              { label: "Features", href: "/features" },
              { label: "Pricing", href: "/pricing" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-xs tracking-widest uppercase text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </header>
  )
}

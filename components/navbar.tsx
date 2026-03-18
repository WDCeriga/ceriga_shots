"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? "bg-background/90 backdrop-blur-md border-b border-border" : "bg-transparent"
      }`}
    >
      <nav className="max-w-7xl mx-auto px-6 lg:px-12 flex items-center justify-between h-16">
        <Link href="/" className="text-foreground text-sm font-semibold tracking-[0.2em] uppercase">
          Ceriga<span className="text-accent">.</span>
        </Link>

        <div className="flex items-center gap-6">
          <Link
            href="#pricing"
            className="text-xs tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors duration-300"
          >
            Pricing
          </Link>
          <Link
            href="/dashboard/generate"
            className="text-xs tracking-widest uppercase bg-foreground text-background px-5 py-2.5 hover:bg-accent hover:text-foreground transition-colors duration-300"
          >
            Launch Studio
          </Link>
        </div>
      </nav>
    </header>
  )
}

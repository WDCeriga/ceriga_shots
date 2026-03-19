"use client"

import { useState } from "react"
import { Play } from "lucide-react"
import Image from "next/image"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const videoPreviews = [
  { src: "/images/hoodie-lifestyle.jpg", platform: "TikTok", duration: "0:15" },
  { src: "/images/hoodie-angle.jpg", platform: "Reels", duration: "0:30" },
  { src: "/images/gallery-1.jpg", platform: "Stories", duration: "0:10" },
]

export function VideoSection() {
  const [selected, setSelected] = useState<(typeof videoPreviews)[number] | null>(null)

  return (
    <section className="py-32 max-w-7xl mx-auto px-6 lg:px-12 overflow-x-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        {/* Text */}
        <div>
          <span className="flex items-center gap-3 mb-6">
            <span className="w-6 h-px bg-accent" />
            <span className="text-accent text-xs tracking-[0.3em] uppercase font-medium">Motion Content</span>
          </span>
          <h2 className="text-4xl lg:text-6xl font-black tracking-tight text-foreground text-balance mb-6">
            Turn images into motion.
          </h2>
          <p className="text-muted-foreground leading-relaxed text-lg mb-8 max-w-md">
            Ceriga generates short looping video clips from your product images — optimized for TikTok, Instagram Reels, and Stories. Subtle zoom, parallax, and motion effects that convert.
          </p>
          <ul className="space-y-3">
            {["Auto-formatted for each platform", "Subtle zoom & motion effects", "Ready-to-post, no editing needed"].map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="w-1.5 h-1.5 bg-accent flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Video previews */}
        <div className="flex gap-2 sm:gap-3 justify-center lg:justify-end overflow-hidden w-full">
          {videoPreviews.map((video, i) => (
            <button
              type="button"
              key={video.platform}
              onClick={() => setSelected(video)}
              aria-label={`Open ${video.platform} preview (${video.duration})`}
              className={`relative overflow-hidden group flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                i === 1
                  ? "w-32 sm:w-36 aspect-[9/16]"
                  : "w-28 sm:w-32 aspect-[9/16] mt-6 sm:mt-8"
              }`}
              style={{ transform: i === 0 ? "rotate(-2deg)" : i === 2 ? "rotate(2deg)" : "none" }}
            >
              <Image
                src={video.src}
                alt={`${video.platform} video preview`}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-700"
                sizes={i === 1 ? "(min-width: 1024px) 176px, 176px" : "(min-width: 1024px) 144px, 144px"}
              />
              {/* Dark overlay */}
              <div className="absolute inset-0 bg-background/40 group-hover:bg-background/20 transition-colors duration-300" />

              {/* Play button */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 border border-foreground/60 flex items-center justify-center bg-background/30 backdrop-blur-sm group-hover:bg-accent group-hover:border-accent transition-all duration-300">
                  <Play className="w-4 h-4 text-foreground fill-foreground" />
                </div>
              </div>

              {/* Platform badge */}
              <div className="absolute bottom-3 left-0 right-0 flex flex-col items-center gap-1">
                <span className="text-[10px] tracking-widest uppercase text-foreground font-semibold">{video.platform}</span>
                <span className="text-[9px] text-foreground/60">{video.duration}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.platform} preview</DialogTitle>
                <DialogDescription>Sample motion clip concept ({selected.duration}).</DialogDescription>
              </DialogHeader>
              <div className="relative w-full aspect-[9/16] overflow-hidden rounded-md border border-border bg-card">
                <Image
                  src={selected.src}
                  alt={`${selected.platform} preview`}
                  fill
                  className="object-cover"
                  sizes="(min-width: 640px) 512px, 90vw"
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}

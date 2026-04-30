import Image from "next/image"

const galleryItems = [
  { src: "/images/gallery-1.jpg?v=2", span: "col-span-2 row-span-2", label: "Campaign — SS26" },
  { src: "/images/hoodie-lifestyle.jpg?v=2", span: "col-span-1", label: "Lookbook" },
  { src: "/images/gallery-2.jpg?v=2", span: "col-span-1", label: "Flat Lay" },
  { src: "/images/gallery-3.jpg?v=2", span: "col-span-2", label: "Spread" },
  { src: "/images/gallery-4.jpg?v=2", span: "col-span-1", label: "Flat Lay" },
  { src: "/images/hoodie-angle.jpg?v=2", span: "col-span-1", label: "Product Shot" },
]

export function GallerySection() {
  return (
    <section id="gallery" className="py-32 bg-secondary/30">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="mb-16 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <span className="flex items-center gap-3 mb-6">
              <span className="w-6 h-px bg-accent" />
              <span className="text-accent text-xs tracking-[0.3em] uppercase font-medium">Lookbook</span>
            </span>
            <h2 className="text-4xl lg:text-5xl font-black tracking-tight text-foreground text-balance">
              Campaign-ready
              <br />
              from day one.
            </h2>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-xs sm:text-right">
            Every output looks like it came from a professional studio — because it did. Just AI-powered.
          </p>
        </div>

        {/* Masonry-like grid */}
        <div className="grid grid-cols-4 gap-1 auto-rows-[270px]">
          {galleryItems.map((item, i) => (
            <div
              key={i}
              className={`relative overflow-hidden group cursor-pointer ${item.span} ${item.tileClassName ?? ""}`}
            >
              <Image
                src={item.src}
                alt={item.label}
                fill
                className={`object-cover object-center ${item.imageClassName ?? ""}`}
                sizes={
                  item.span.includes("col-span-2")
                    ? "(min-width: 1024px) 50vw, (min-width: 640px) 100vw, 100vw"
                    : "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                }
              />
              <div className="absolute inset-0 bg-background/0 group-hover:bg-background/50 transition-all duration-400" />
              <div className="absolute bottom-4 left-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <span className="text-xs text-accent tracking-widest uppercase font-semibold">{item.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

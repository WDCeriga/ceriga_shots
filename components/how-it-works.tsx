import { Download, SlidersHorizontal, Upload } from 'lucide-react'

const steps = [
  {
    number: '01',
    title: 'Upload your product',
    description:
      'Take a raw photo or upload a design file. Any background works. Ceriga automatically prepares your asset for clean generation.',
    Icon: Upload,
    tone: 'from-[#090b10] via-[#0f121a] to-[#07090d]',
  },
  {
    number: '02',
    title: 'Choose cinematic style',
    description:
      'Select from preset looks or describe your scene. Control lighting, mood, and framing to match your brand direction.',
    Icon: SlidersHorizontal,
    tone: 'from-[#1d212c] via-[#151922] to-[#0c0f16]',
  },
  {
    number: '03',
    title: 'Generate & export',
    description:
      'Get polished studio-quality outputs in under 60 seconds. Export in high resolution for ads, PDPs, and social.',
    Icon: Download,
    tone: 'from-[#07090d] via-[#0e1017] to-[#05070a]',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-border py-28">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="mb-14 text-center">
          <p className="text-accent text-xs font-medium uppercase tracking-[0.35em]">Process</p>
          <h2 className="mt-3 text-4xl font-black tracking-tight text-foreground sm:text-5xl">How it Works</h2>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {steps.map((step) => (
            <article key={step.number}>
              <div
                className={`group relative mb-6 h-[360px] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b ${step.tone}`}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(255,255,255,0.1),transparent_55%)]" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />

                <div className="absolute inset-x-10 top-[30%] flex h-28 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-transform duration-500 group-hover:scale-[1.03]">
                  <step.Icon className="h-10 w-10 text-white/45" strokeWidth={1.5} />
                </div>

                <span className="absolute bottom-3 left-4 text-6xl font-black leading-none text-white/[0.12]">
                  {step.number}
                </span>
              </div>

              <h3 className="text-2xl font-semibold tracking-tight text-foreground">{step.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

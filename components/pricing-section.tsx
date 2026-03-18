import Link from "next/link"
import { Check } from "lucide-react"

const plans = [
  {
    name: "Free",
    price: "Free",
    period: "",
    credits: "5 credits / mo",
    description: "Try it out — no card required.",
    features: [
      "All 5 flat lay types",
      "1 detail shot (print only)",
      "Raw preset only",
      "1 project (deleted after 7d)",
    ],
    cta: "Sign Up Free",
    href: "/signup",
    highlighted: false,
  },
  {
    name: "Starter",
    price: "$19",
    period: "/mo",
    credits: "50 credits / mo",
    description: "For indie brands getting started.",
    features: [
      "All 5 flat lay types",
      "Raw + Editorial presets",
      "ZIP downloads & share links",
      "Up to 20 projects stored",
    ],
    cta: "Get Starter",
    href: "/signup",
    highlighted: false,
  },
  {
    name: "Studio",
    price: "$49",
    period: "/mo",
    credits: "200 credits / mo",
    description: "Full creative power for growing brands.",
    features: [
      "Surface shots (draped, hanging)",
      "All 3 detail shots",
      "All 5 visual presets",
      "Up to 100 projects stored",
    ],
    cta: "Try Studio Free",
    href: "/signup",
    highlighted: true,
  },
  {
    name: "Label",
    price: "$99",
    period: "/mo",
    credits: "500 credits / mo",
    description: "For labels with high-volume needs.",
    features: [
      "Everything in Studio",
      "All 5 visual presets",
      "Unlimited projects stored",
      "Generate more on demand",
    ],
    cta: "Go Label",
    href: "/signup",
    highlighted: false,
  },
]

export function PricingSection() {
  return (
    <section id="pricing" className="py-32 border-t border-border">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="text-center mb-20">
          <span className="inline-flex items-center gap-3 mb-6">
            <span className="w-6 h-px bg-accent" />
            <span className="text-accent text-xs tracking-[0.3em] uppercase font-medium">
              Pricing
            </span>
            <span className="w-6 h-px bg-accent" />
          </span>
          <h2 className="text-4xl lg:text-5xl font-black tracking-tight text-foreground text-balance mb-6">
            Simple, transparent pricing.
          </h2>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-md mx-auto">
            Start free. Upgrade when you&apos;re ready to scale your content production.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col border p-7 transition-colors duration-300 ${
                plan.highlighted
                  ? "border-accent bg-accent/[0.03]"
                  : "border-border hover:border-foreground/20"
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-7 bg-accent text-foreground text-[10px] tracking-[0.2em] uppercase font-bold px-3 py-1">
                  Most Popular
                </span>
              )}

              <div className="mb-6">
                <h3 className="text-xs tracking-[0.2em] uppercase font-semibold text-muted-foreground mb-3">
                  {plan.name}
                </h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-black text-foreground tracking-tight">
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className="text-muted-foreground text-sm">{plan.period}</span>
                  )}
                </div>
                <p className="text-accent text-xs font-semibold tracking-wide mb-3">
                  {plan.credits}
                </p>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {plan.description}
                </p>
              </div>

              <ul className="flex-1 space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <Check className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={`mt-auto inline-flex items-center justify-center text-xs font-semibold tracking-wider uppercase px-5 py-3.5 transition-all duration-300 ${
                  plan.highlighted
                    ? "bg-foreground text-background hover:bg-accent hover:text-foreground"
                    : "border border-border text-foreground hover:border-foreground"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

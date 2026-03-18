import { Fragment } from "react"
import Link from "next/link"
import { Check, X } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Pricing",
}

const plans = [
  {
    name: "Free",
    price: "€0",
    period: "",
    credits: "5 credits / mo",
    cta: "Sign Up Free",
    href: "/signup",
    highlighted: false,
  },
  {
    name: "Starter",
    price: "€19",
    period: " / mo",
    credits: "50 credits / mo",
    cta: "Get Starter",
    href: "/signup",
    highlighted: false,
  },
  {
    name: "Studio",
    price: "€49",
    period: " / mo",
    credits: "200 credits / mo",
    cta: "Try Studio Free",
    href: "/signup",
    highlighted: true,
  },
  {
    name: "Label",
    price: "€99",
    period: " / mo",
    credits: "500 credits / mo",
    cta: "Go Label",
    href: "/signup",
    highlighted: false,
  },
]

type FeatureValue = boolean | string

interface FeatureRow {
  name: string
  sub?: string
  values: [FeatureValue, FeatureValue, FeatureValue, FeatureValue]
}

interface FeatureGroup {
  label: string
  rows: FeatureRow[]
}

const featureGroups: FeatureGroup[] = [
  {
    label: "Credits & Usage",
    rows: [
      { name: "Credits per month", values: ["5", "50", "200", "500"] },
      { name: "Credit expiry", values: ["14 days", "Never", "Never", "Never"] },
      { name: "Cost per credit", values: ["—", "€0.38", "€0.25", "€0.20"] },
    ],
  },
  {
    label: "Shot Types",
    rows: [
      {
        name: "Flat lay shots",
        sub: "Top-down, 45°, sleeves, relaxed, folded",
        values: ["2 types", "All 5", "All 5", "All 5"],
      },
      {
        name: "Surface shots",
        sub: "Draped, hanging",
        values: [false, false, true, true],
      },
      {
        name: "Detail shots",
        sub: "Print close-up, fabric macro, collar",
        values: [false, false, "All 3", "All 3"],
      }, 
    ],
  },
  {
    label: "Visual Presets",
    rows: [
      {
        name: "Raw preset",
        sub: "Dark concrete, hard light",
        values: [true, true, true, true],
      },
      {
        name: "Editorial preset",
        sub: "Slate, diffused, cold",
        values: [false, true, true, true],
      },
      {
        name: "Luxury preset",
        sub: "Dark marble, soft overhead",
        values: [false, false, true, true],
      },
      {
        name: "Studio preset",
        sub: "White backdrop, studio lighting",
        values: [false, false, true, true],
      },
      {
        name: "Surprise preset",
        sub: "Random, never the same twice",
        values: [false, false, true, true],
      },
    ],
  },
  {
    label: "Output & Downloads",
    rows: [
      { name: "Download images", values: ["Watermarked", true, true, true] },
      { name: "ZIP batch download", values: [true, true, true, true] },
      { name: "Share links", values: [true, true, true, true] },
      { name: "Output resolution", values: ["Standard", "HD", "4K", "4K"] },
    ],
  },
  {
    label: "Projects & Storage",
    rows: [
      {
        name: "Projects stored",
        values: ["1 (deleted after 7d)", "20", "100", "Unlimited"],
      },
      {
        name: "Generate more per project",
        sub: "Add shots to existing projects",
        values: [false, true, true, true],
      },
    ],
  },
  {
    label: "Advanced",
    rows: [
      {
        name: "Priority generation",
        sub: "Skip the queue",
        values: [false, false, false, true],
      },
      {
        name: "API access",
        sub: "Integrate with your own tools",
        values: [false, false, false, true],
      },
      {
        name: "Custom style training",
        sub: "Train on your brand's aesthetic",
        values: [false, false, false, true],
      },
      { name: "Dedicated support", values: [false, false, false, true] },
    ],
  },
]

function CellValue({ value }: { value: FeatureValue }) {
  if (value === true) return <Check className="w-4 h-4 text-accent" />
  if (value === false) return <X className="w-4 h-4 text-muted-foreground/30" />
  return <span className="text-sm text-foreground">{value}</span>
}

export default function PricingPage() {
  return (
    <div className="p-6 sm:p-10 max-w-6xl mx-auto">
      <div className="mb-12">
        <h1 className="text-3xl font-black tracking-tight text-foreground mb-2">
          Pricing
        </h1>
        <p className="text-muted-foreground text-sm">
          Every feature, side by side. Pick the plan that fits your brand.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[640px]">
          <thead>
            <tr className="border-b border-border">
              <th className="w-[30%] p-0" />
              {plans.map((plan) => (
                <th
                  key={plan.name}
                  className={`text-center align-bottom px-3 pb-6 pt-2 ${
                    plan.highlighted ? "bg-accent/[0.04]" : ""
                  }`}
                >
                  {plan.highlighted && (
                    <span className="inline-block bg-accent text-foreground text-[9px] tracking-[0.2em] uppercase font-bold px-2.5 py-1 mb-3">
                      Most Popular
                    </span>
                  )}
                  <div
                    className={`text-xs tracking-[0.2em] uppercase font-semibold mb-2 ${
                      plan.highlighted
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {plan.name}
                  </div>
                  <div className="flex items-baseline justify-center gap-0.5 mb-1">
                    <span className="text-2xl font-black text-foreground tracking-tight">
                      {plan.price}
                    </span>
                    {plan.period && (
                      <span className="text-muted-foreground text-xs">
                        {plan.period}
                      </span>
                    )}
                  </div>
                  <div className="text-accent text-[11px] font-semibold tracking-wide">
                    {plan.credits}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {featureGroups.map((group) => (
              <Fragment key={group.label}>
                <tr>
                  <td
                    colSpan={5}
                    className="pt-8 pb-3 text-[10px] tracking-[0.25em] uppercase font-bold text-muted-foreground"
                  >
                    {group.label}
                  </td>
                </tr>
                {group.rows.map((row) => (
                  <tr
                    key={row.name}
                    className="border-b border-border/40 group hover:bg-secondary/20 transition-colors"
                  >
                    <td className="py-3.5 pr-4">
                      <span className="text-sm text-foreground font-medium">
                        {row.name}
                      </span>
                      {row.sub && (
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          {row.sub}
                        </span>
                      )}
                    </td>
                    {row.values.map((val, i) => (
                      <td
                        key={i}
                        className={`text-center py-3.5 px-3 ${
                          plans[i].highlighted ? "bg-accent/[0.04]" : ""
                        }`}
                      >
                        <span className="inline-flex justify-center">
                          <CellValue value={val} />
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}

            {/* Bottom CTA row */}
            <tr>
              <td className="pt-10" />
              {plans.map((plan) => (
                <td
                  key={plan.name}
                  className={`text-center pt-10 px-2 ${
                    plan.highlighted ? "bg-accent/[0.04]" : ""
                  }`}
                >
                  <Link
                    href={plan.href}
                    className={`inline-flex items-center justify-center text-[10px] font-semibold tracking-wider uppercase px-4 py-3 transition-all duration-300 w-full ${
                      plan.highlighted
                        ? "bg-foreground text-background hover:bg-accent hover:text-foreground"
                        : "border border-border text-foreground hover:border-foreground"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

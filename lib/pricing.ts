export interface PricingPlan {
  name: string
  monthlyPrice: number
  creditsPerMonth: number
  highlighted?: boolean
  useCase: string
  description: string
  features: string[]
  landingCta: string
  dashboardCta: string
}

export const pricingPlans: PricingPlan[] = [
  {
    name: 'Free',
    monthlyPrice: 0,
    creditsPerMonth: 8,
    landingCta: 'Sign Up Free',
    dashboardCta: 'Start Free',
    useCase: 'Best for first-time testing',
    description: 'Try core generation flows before committing to a paid plan.',
    features: ['2 flat lay types', '1 detail shot', 'ZIP downloads', '3 projects'],
  },
  {
    name: 'Starter',
    monthlyPrice: 19,
    creditsPerMonth: 100,
    landingCta: 'Get Starter',
    dashboardCta: 'Choose Starter',
    useCase: 'Best for solo founders',
    description: 'A strong baseline for small catalogs and weekly content.',
    features: ['All 5 flat lay types', 'Raw + Editorial presets', 'HD exports', 'Up to 20 projects'],
  },
  {
    name: 'Studio',
    monthlyPrice: 49,
    creditsPerMonth: 300,
    landingCta: 'Try Studio Free',
    dashboardCta: 'Choose Studio',
    highlighted: true,
    useCase: 'Best for growing brands',
    description: 'Your main production plan for campaigns, launches, and ad variants.',
    features: ['All shot categories', 'All visual presets', 'Image editing (AI refinements)', '4K exports', 'Up to 100 projects'],
  },
  {
    name: 'Label',
    monthlyPrice: 99,
    creditsPerMonth: 750,
    landingCta: 'Go Label',
    dashboardCta: 'Choose Label',
    useCase: 'Best for high-volume teams',
    description: 'High-throughput plan with priority support for consistent output.',
    features: ['Everything in Studio', 'Priority generation', 'Unlimited projects'],
  },
]

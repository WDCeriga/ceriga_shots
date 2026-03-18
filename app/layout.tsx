import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/toaster'
import { AppSessionProvider } from '@/components/session-provider'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
    : undefined,
  title: {
    default: 'Ceriga Shots',
    template: '%s | Ceriga Shots',
  },
  description: 'AI Product Content for Clothing Brands',
  applicationName: 'Ceriga Shots',
  icons: {
    icon: '/icon.svg',
  },
  openGraph: {
    type: 'website',
    title: 'Ceriga Shots',
    description: 'AI Product Content for Clothing Brands',
    images: [{ url: '/icon.svg' }],
  },
  twitter: {
    card: 'summary',
    title: 'Ceriga Shots',
    description: 'AI Product Content for Clothing Brands',
    images: ['/icon.svg'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AppSessionProvider>
          {children}
          <Toaster />
          <Analytics />
        </AppSessionProvider>
      </body>
    </html>
  )
}

import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/toaster'
import { AppSessionProvider } from '@/components/session-provider'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://ceriga-shots.vercel.app'),
  title: {
    default: 'Ceriga Shots',
    template: '%s | Ceriga Shots',
  },
  description:
    'Generate AI flat lays, product shots, and short fashion video clips for clothing brands. Upload your design and download a complete content pack.',
  applicationName: 'Ceriga Shots',
  icons: {
    icon: '/icon.svg',
  },
  openGraph: {
    type: 'website',
    title: 'Ceriga Shots',
    description:
      'Generate AI flat lays, product shots, and short fashion video clips for clothing brands. Upload your design and download a complete content pack.',
    images: [{ url: '/icon.svg' }],
  },
  twitter: {
    card: 'summary',
    title: 'Ceriga Shots',
    description:
      'Generate AI flat lays, product shots, and short fashion video clips for clothing brands. Upload your design and download a complete content pack.',
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

import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/toaster'
import { FeedbackFab } from '@/components/feedback-fab'
import { AppSessionProvider } from '@/components/session-provider'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://ceriga-shots.vercel.app'),
  manifest: '/manifest.webmanifest',
  title: {
    default: 'Ceriga Shots',
    template: '%s | Ceriga Shots',
  },
  description:
    'Generate AI flat lays, product shots, and short fashion video clips for clothing brands. Upload your design and download a complete content pack.',
  applicationName: 'Ceriga Shots',
  icons: {
    icon: [
      {
        media: '(prefers-color-scheme: light)',
        url: '/ceriga-favicon-light-32x32.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        media: '(prefers-color-scheme: dark)',
        url: '/ceriga-favicon-dark-32x32.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: '/ceriga-favicon-light-32x32.png',
        sizes: '32x32',
        type: 'image/png',
      },
    ],
    shortcut: [
      {
        media: '(prefers-color-scheme: light)',
        url: '/ceriga-favicon-light-32x32.png',
        type: 'image/png',
      },
      {
        media: '(prefers-color-scheme: dark)',
        url: '/ceriga-favicon-dark-32x32.png',
        type: 'image/png',
      },
    ],
    apple: '/ceriga-favicon-light-512x512.png',
  },
  openGraph: {
    type: 'website',
    title: 'Ceriga Shots',
    description:
      'Generate AI flat lays, product shots, and short fashion video clips for clothing brands. Upload your design and download a complete content pack.',
    images: [{ url: '/ceriga-favicon-light-512x512.png' }],
  },
  twitter: {
    card: 'summary',
    title: 'Ceriga Shots',
    description:
      'Generate AI flat lays, product shots, and short fashion video clips for clothing brands. Upload your design and download a complete content pack.',
    images: ['/ceriga-favicon-light-512x512.png'],
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
          <FeedbackFab />
          <Toaster />
          <Analytics />
        </AppSessionProvider>
      </body>
    </html>
  )
}

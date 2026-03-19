import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ceriga Shots',
    short_name: 'Ceriga Shots',
    description:
      'Generate AI flat lays, product shots, and short fashion video clips for clothing brands.',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      {
        src: '/ceriga-favicon-light-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/ceriga-favicon-dark-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/ceriga-favicon-light-32x32.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        src: '/ceriga-favicon-dark-32x32.png',
        sizes: '32x32',
        type: 'image/png',
      },
    ],
  }
}

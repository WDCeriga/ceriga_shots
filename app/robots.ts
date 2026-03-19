import type { MetadataRoute } from 'next'

const baseUrl = 'https://ceriga-shots.vercel.app'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/login', '/signup', '/share/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}


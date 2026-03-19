import type { MetadataRoute } from 'next'

const baseUrl = 'https://ceriga-shots.vercel.app'

export default function sitemap(): MetadataRoute.Sitemap {
  const staticUrls: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/ai-flat-lay-generator`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/ai-product-shots`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/ai-fashion-video-generator`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
    },
  ]

  return staticUrls
}


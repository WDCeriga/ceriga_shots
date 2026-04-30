import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    // Avoid Turbopack inferring an outer workspace root.
    root: projectRoot,
  },
  images: {
    localPatterns: [
      {
        pathname: '/images/**',
      },
      {
        pathname: '/images/**',
        search: '?v=*',
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
}

export default nextConfig

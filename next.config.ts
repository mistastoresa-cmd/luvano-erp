import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // No UI in this phase — API-routes-only usage of the App Router.
  turbopack: {
    root: __dirname,
  },
}

export default nextConfig

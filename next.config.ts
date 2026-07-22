import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Real bug hit wiring up the local dev database: pglite loads its WASM
  // binary via `fs.readFileSync(new URL(...))` internally, and when Next's
  // dev server bundles that code (webpack or Turbopack, both hit this) the
  // resulting URL instance fails Node's `instanceof URL` check inside `fs`
  // — "path argument must be ... an instance of Buffer or URL. Received an
  // instance of URL". Excluding it from bundling (require()'d straight from
  // node_modules instead) avoids the realm mismatch entirely.
  serverExternalPackages: ['@electric-sql/pglite'],
  turbopack: {
    root: __dirname,
  },
}

export default nextConfig

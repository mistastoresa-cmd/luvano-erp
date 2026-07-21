import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import * as schema from '@/db/schema'

// Better Auth's config (lib/auth/server.ts) needs a db instance synchronously
// at module-load time — unlike db/client.ts::createDb() (async, branches
// between neon-serverless in prod and pglite in tests via dynamic import).
// Auth only ever runs against real Postgres (no pglite auth tests in this
// phase), so a plain synchronous Neon Pool is enough here — no test branch.
neonConfig.webSocketConstructor = ws

// Real build failure hit and fixed: `next build` collects page data for every
// route module (including app/api/auth/[...all]/route.ts) with NODE_ENV
// already 'production', which previously made this file throw eagerly at
// import time whenever DATABASE_URL wasn't set — breaking the build itself,
// not just runtime requests, in any environment building without prod
// secrets configured (this sandbox, CI, etc). The Pool/drizzle instance is
// now constructed lazily on first actual use; a missing DATABASE_URL still
// fails, but only when something really tries to query, not on import.
let _authDb: ReturnType<typeof drizzle<typeof schema>> | undefined

function getAuthDb() {
  if (_authDb) return _authDb
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for Better Auth')
  }
  const pool = new Pool({ connectionString })
  _authDb = drizzle(pool, { schema })
  return _authDb
}

export const authDb = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop, receiver) {
    return Reflect.get(getAuthDb(), prop, receiver)
  },
})

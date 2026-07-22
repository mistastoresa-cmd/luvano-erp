import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import ws from 'ws'
import * as schema from '@/db/schema'
import { getDevDb } from '@/db/dev-pglite'

// Better Auth's config (lib/auth/server.ts) needs a db instance synchronously
// at module-load time — unlike db/client.ts::createDb() (async, branches
// between neon-serverless in prod/dev-with-secrets, persisted pglite in
// local dev without secrets, and in-memory pglite in tests).
neonConfig.webSocketConstructor = ws

type AuthDb = PgDatabase<any, typeof schema>

// Real build failure hit and fixed: `next build` collects page data for every
// route module (including app/api/auth/[...all]/route.ts) with NODE_ENV
// already 'production', which previously made this file throw eagerly at
// import time whenever DATABASE_URL wasn't set — breaking the build itself,
// not just runtime requests, in any environment building without prod
// secrets configured (this sandbox, CI, etc). The Pool/drizzle instance is
// now constructed lazily on first actual use; a missing DATABASE_URL still
// fails in production, but only when something really tries to query, not
// on import.
let _authDb: AuthDb | undefined

function getAuthDb(): AuthDb {
  if (_authDb) return _authDb
  const connectionString = process.env.DATABASE_URL
  if (connectionString) {
    const pool = new Pool({ connectionString })
    _authDb = drizzle(pool, { schema }) as unknown as AuthDb
    return _authDb
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required for Better Auth')
  }

  // Local dev without cloud secrets — the exact same drizzle instance as
  // db/client.ts::createDb() (db/dev-pglite.ts::getDevDb(), a true
  // singleton), so auth data (user, session, organization, ...) and app
  // data (tenants, branches, ...) live in one physical database, mirroring
  // production where both point at one Neon database. Schema must already
  // exist here — `npm run db:seed` migrates the shared store before doing
  // anything else, and this Proxy's `get` trap has to resolve synchronously
  // (Better Auth calls into authDb per-query, not through an awaited setup
  // step), so there's no room here to run a migration the way
  // db/client.ts's async createDb() does.
  _authDb = getDevDb() as unknown as AuthDb
  return _authDb
}

export const authDb = new Proxy({} as AuthDb, {
  get(_target, prop, receiver) {
    return Reflect.get(getAuthDb(), prop, receiver)
  },
})

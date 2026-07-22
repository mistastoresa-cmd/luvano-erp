import type { PgDatabase, PgTransaction } from 'drizzle-orm/pg-core'
import * as schema from './schema'

// Three modes behind one factory: Neon's Pool (WebSocket, transaction-capable)
// driver whenever DATABASE_URL is set (prod, or dev with real cloud secrets),
// in-memory pglite in tests (`vitest run` never needs a provisioned database
// or network access), and persisted pglite for local dev without any secrets
// at all (db/dev-pglite.ts) — `npm run dev`/`npm run db:seed` work out of the
// box on a fresh checkout. All three implement the same drizzle-orm query
// surface, so `db/schema/*` and `lib/ledger/*` are written once against the
// Drizzle API and work against any of them.
//
// Db/Tx are typed against drizzle's driver-agnostic base classes (not the
// concrete NeonDatabase/PgliteDatabase union CreateDb's return type would
// otherwise infer) — a union of two concrete driver types breaks assignability
// of the `tx` parameter inside `db.transaction(async (tx) => ...)`, since each
// driver has its own distinct transaction row-result type. Functions in
// lib/ledger/* accept `DbOrTx` so the same code runs whether called with the
// top-level db or from inside a transaction callback.
export type Db = PgDatabase<any, typeof schema>
export type Tx = PgTransaction<any, typeof schema, any>
export type DbOrTx = Db | Tx

export async function createDb(): Promise<Db> {
  if (process.env.NODE_ENV === 'test') {
    const { drizzle } = await import('drizzle-orm/pglite')
    const { PGlite } = await import('@electric-sql/pglite')
    const client = new PGlite()
    return drizzle(client, { schema }) as unknown as Db
  }

  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_URL is required in production')
    }
    // Local dev without cloud secrets — persisted pglite (db/dev-pglite.ts,
    // shared with lib/auth/db.ts::authDb via the exact same drizzle
    // instance, not just the same directory — real bug hit doing this with
    // two separate drizzle(pglite(...)) constructions pointed at one
    // dataDir: dynamic vs static import of drizzle-orm/pglite landed in
    // different module instances under Turbopack, so each side built its
    // own PGlite client against the same on-disk store, and every query
    // failed with a bizarre "path argument must be a string... received an
    // instance of URL" error. db/dev-pglite.ts is now the only place that
    // constructs it.
    const { getDevDb, ensureDevDbMigrated } = await import('./dev-pglite')
    await ensureDevDbMigrated()
    return getDevDb() as unknown as Db
  }

  // neon-http does NOT support db.transaction() (Neon's plain HTTP driver has no
  // multi-statement transaction support in drizzle). recordSaleInvoice needs a
  // real transaction (invoice + lines + movements + balance update, atomically),
  // so this uses the Pool-based neon-serverless driver instead, which drizzle
  // backs with real transactions over a WebSocket connection.
  const { drizzle } = await import('drizzle-orm/neon-serverless')
  const { Pool, neonConfig } = await import('@neondatabase/serverless')
  // Node.js (unlike edge runtimes) has no built-in WebSocket global the Neon
  // driver can use, so it needs the `ws` package wired in explicitly here.
  const { default: ws } = await import('ws')
  neonConfig.webSocketConstructor = ws
  const url = process.env.DATABASE_URL
  const pool = new Pool({ connectionString: url })
  return drizzle(pool, { schema }) as unknown as Db
}

// Process-wide cached instance for application code (pages, the seed
// script) — createDb() itself stays a plain factory (tests call it
// expecting a fresh instance), this is the "call once, reuse everywhere"
// wrapper every other caller should use instead of calling createDb()
// directly, so a Neon Pool/pglite migration doesn't re-run per request.
let _dbPromise: Promise<Db> | undefined

export function getDb(): Promise<Db> {
  if (!_dbPromise) _dbPromise = createDb()
  return _dbPromise
}

import type { PgDatabase, PgTransaction } from 'drizzle-orm/pg-core'
import * as schema from './schema'

// Two drivers behind one factory: Neon's Pool (WebSocket, transaction-capable)
// driver in prod/dev, pglite (in-memory Postgres via WASM) in tests, so
// `vitest run` never needs a provisioned database or network access. Both
// implement the same drizzle-orm query surface, so `db/schema/*` and
// `lib/ledger/*` are written once against the Drizzle API and work against
// either.
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
  if (!url) throw new Error('DATABASE_URL is required outside of NODE_ENV=test')
  const pool = new Pool({ connectionString: url })
  return drizzle(pool, { schema }) as unknown as Db
}

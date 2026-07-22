import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import * as schema from './schema'

const DATA_DIR = './.data/dev.pgdata'

// Real bug hit wiring this up: db/client.ts originally dynamic-`import()`ed
// drizzle-orm/pglite while lib/auth/db.ts statically imported it — under
// Turbopack those two import styles landed in different module instances,
// so each side built its OWN PGlite client against the same dataDir
// (PGlite doesn't support concurrent instances against one directory) and
// every query failed with a bizarre "path argument must be a string...
// Received an instance of URL" error. Fix: exactly one module constructs
// the client AND the drizzle wrapper, and both db/client.ts and
// lib/auth/db.ts import the same functions from here — never duplicate
// this construction elsewhere.
let _client: PGlite | undefined
let _db: ReturnType<typeof drizzle<typeof schema>> | undefined
let _migrated: Promise<void> | undefined

function getClient(): PGlite {
  if (!_client) {
    // PGlite doesn't create its parent directory itself — real error hit:
    // "ENOENT: no such file or directory, mkdir '.../.data/dev.pgdata'" on
    // the very first run before `.data/` existed.
    mkdirSync(dirname(DATA_DIR), { recursive: true })
    _client = new PGlite(DATA_DIR)
  }
  return _client
}

export function getDevDb() {
  if (!_db) {
    _db = drizzle(getClient(), { schema })
  }
  return _db
}

// Idempotent and memoized — safe to call from every code path that touches
// the dev store (db/client.ts on every getDb() call); only actually runs
// the migration SQL once per process, and drizzle's migrate() is itself
// safe to re-run against an already-migrated database regardless.
export function ensureDevDbMigrated(): Promise<void> {
  if (!_migrated) {
    _migrated = migrate(getDevDb(), { migrationsFolder: './db/migrations' })
  }
  return _migrated
}

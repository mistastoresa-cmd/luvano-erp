import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from '@/db/schema'

// Fresh in-memory Postgres (via WASM) per test file, with real migrations applied
// — proves the migration SQL itself is valid, not just the TypeScript schema
// definitions, and gives real Postgres semantics (unique constraints, relative
// UPDATE evaluation) for the concurrency/oversell tests to exercise.
export async function createTestDb() {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './db/migrations' })
  return db
}

import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { branches } from './branches'

// The branch-sync API's server-side contract surface. No PWA client is built in
// this phase, but this is the table it will submit batches against — see
// lib/sync/types.ts and docs/design-spikes/02-offline-reconciliation.md.
export const syncBatches = pgTable('sync_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  branchId: uuid('branch_id')
    .notNull()
    .references(() => branches.id),
  // Identifies the PWA instance (localStorage-persisted UUID).
  deviceId: text('device_id').notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  itemCount: integer('item_count').notNull(),
  acceptedCount: integer('accepted_count').notNull().default(0),
  rejectedCount: integer('rejected_count').notNull().default(0),
  status: text('status', { enum: ['processing', 'completed', 'partial_failure'] })
    .notNull()
    .default('processing'),
})

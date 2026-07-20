import { pgTable, uuid, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { branches } from './branches'

// Output surface for the conflict-resolution and offline-reconciliation strategies
// (docs/design-spikes/01 and 02): both spikes deliberately never block a write —
// they let the ledger record what happened and raise a flag here for a human to
// resolve (compensating adjustment, cancel one order, etc).
export const reconciliationAlerts = pgTable('reconciliation_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  branchId: uuid('branch_id')
    .notNull()
    .references(() => branches.id),
  sku: text('sku').notNull(),
  type: text('type', { enum: ['oversell', 'negative_balance', 'stale_offline_batch'] }).notNull(),
  detail: jsonb('detail').notNull(),
  resolved: boolean('resolved').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

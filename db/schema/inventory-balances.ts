import { pgTable, uuid, text, integer, numeric, bigint, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { branches } from './branches'

// Materialized current-state projection. `inventory_movements` (append-only) is the
// source of truth for history; this table is the fast-read/concurrency-control
// surface every write updates atomically alongside its movement row.
export const inventoryBalances = pgTable(
  'inventory_balances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    sku: text('sku').notNull(),
    quantity: integer('quantity').notNull().default(0),
    // Weighted-average cost per unit. Blended on cost-bearing increases only
    // (purchase receipts, transfer-in using the source branch's cost) via
    // lib/ledger/balance.ts::applyInventoryDeltaWithCost — decreases (sales,
    // transfer-out, adjustments) leave it unchanged, matching standard
    // weighted-average costing. Extra scale (4 vs the usual 2) because
    // repeated blending accumulates rounding otherwise. Starts at 0 for a SKU
    // that's never had a cost-bearing receipt (e.g. a sale posted before any
    // purchase was recorded) — postSaleInvoiceJournal's COGS line will be 0
    // in that case, which is a known simplification, not a bug.
    averageCost: numeric('average_cost', { precision: 14, scale: 4 }).notNull().default('0'),
    // Incremented on every update. Exposed to clients as an optimistic-read
    // consistency signal — NOT the primary conflict-avoidance mechanism (see
    // docs/design-spikes/01-conflict-resolution.md: that's the atomic relative
    // SQL update itself).
    version: bigint('version', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('inventory_balances_tenant_branch_sku_idx').on(
      table.tenantId,
      table.branchId,
      table.sku
    ),
  ]
)

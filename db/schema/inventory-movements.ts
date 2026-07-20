import { pgTable, uuid, text, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { branches } from './branches'
import { saleInvoices } from './sale-invoices'

// Append-only — rows here are never updated or deleted. Every write is a new fact,
// which is what makes the conflict-resolution strategy in
// docs/design-spikes/01-conflict-resolution.md possible: there is never a "last
// write wins and silently overwrites a fact" problem, only an atomic relative
// update to inventory_balances alongside each insert.
export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    sku: text('sku').notNull(),
    // Salla's product/variant id, when known.
    sallaProductId: text('salla_product_id'),
    // Signed: negative = decrement (sale/transfer-out), positive = increment
    // (return/adjustment/transfer-in/initial stock).
    quantityDelta: integer('quantity_delta').notNull(),
    reason: text('reason', {
      enum: ['sale', 'return', 'adjustment', 'transfer_in', 'transfer_out', 'initial_stock'],
    }).notNull(),
    sourceType: text('source_type', {
      enum: ['salla_webhook', 'branch_pos', 'branch_offline_sync', 'manual_adjustment', 'system'],
    }).notNull(),
    // Salla order id, POS terminal ref, etc.
    sourceReference: text('source_reference'),
    saleInvoiceId: uuid('sale_invoice_id').references(() => saleInvoices.id),
    // Core dedupe/replay-safety constraint. e.g. "salla:order:{id}:line:{n}" for
    // webhook-sourced rows, or the client UUID for offline rows.
    idempotencyKey: text('idempotency_key').notNull(),
    // Set only for branch-originated (PWA-created) rows — generated offline,
    // before the row ever has a server id.
    clientGeneratedId: uuid('client_generated_id'),
    // Event time as reported by the source — may be hours in the past for
    // offline-synced rows.
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    uniqueIndex('inventory_movements_tenant_idempotency_idx').on(
      table.tenantId,
      table.idempotencyKey
    ),
    index('inventory_movements_tenant_branch_sku_occurred_idx').on(
      table.tenantId,
      table.branchId,
      table.sku,
      table.occurredAt
    ),
  ]
)

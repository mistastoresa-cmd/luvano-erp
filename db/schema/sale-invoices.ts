import { pgTable, uuid, text, numeric, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { branches } from './branches'

// One row per sale event — this table IS "unified invoicing" per the design doc's
// definition: a single invoice record per sale, whether it originated from a Salla
// order or a branch POS/offline sale, all deducting from the same inventory balance.
export const saleInvoices = pgTable(
  'sale_invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    invoiceNumber: text('invoice_number').notNull(),
    sourceType: text('source_type', {
      enum: ['salla_order', 'branch_pos', 'branch_offline'],
    }).notNull(),
    // Salla order id/reference when sourceType is 'salla_order'.
    sourceReference: text('source_reference'),
    customerName: text('customer_name'),
    customerPhone: text('customer_phone'),
    currency: text('currency').notNull().default('SAR'),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
    discountTotal: numeric('discount_total', { precision: 12, scale: 2 }).notNull().default('0'),
    taxTotal: numeric('tax_total', { precision: 12, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 12, scale: 2 }).notNull(),
    status: text('status', {
      enum: ['completed', 'refunded', 'partially_refunded', 'voided'],
    })
      .notNull()
      .default('completed'),
    // Dedupe/replay-safety key. Server-computed for webhook-sourced rows
    // (e.g. "salla:order:{id}"), client-supplied (= clientGeneratedId) for
    // offline-created rows. See docs/design-spikes/02-offline-reconciliation.md.
    idempotencyKey: text('idempotency_key').notNull(),
    // UUID the PWA generates offline, before the row ever has a server id.
    clientGeneratedId: uuid('client_generated_id'),
    // Event time as reported by the source — may be hours in the past for
    // offline-synced rows.
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    uniqueIndex('sale_invoices_tenant_idempotency_idx').on(table.tenantId, table.idempotencyKey),
    index('sale_invoices_tenant_branch_occurred_idx').on(
      table.tenantId,
      table.branchId,
      table.occurredAt
    ),
  ]
)

import { pgTable, uuid, text, integer, numeric } from 'drizzle-orm/pg-core'
import { saleInvoices } from './sale-invoices'
import { inventoryMovements } from './inventory-movements'

export const saleInvoiceLines = pgTable('sale_invoice_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => saleInvoices.id, { onDelete: 'cascade' }),
  sku: text('sku').notNull(),
  productName: text('product_name').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  discount: numeric('discount', { precision: 12, scale: 2 }).notNull().default('0'),
  tax: numeric('tax', { precision: 12, scale: 2 }).notNull().default('0'),
  lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
  // The movement row this line generated. This FK is the schema-level enforcement
  // of "unified invoicing" — every sale line that affects stock must point at its
  // movement, so invoice totals and inventory history can never silently diverge.
  inventoryMovementId: uuid('inventory_movement_id').references(() => inventoryMovements.id),
})

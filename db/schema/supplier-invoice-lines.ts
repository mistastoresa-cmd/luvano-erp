import { pgTable, uuid, text, integer, numeric } from 'drizzle-orm/pg-core'
import { supplierInvoices } from './supplier-invoices'

export const supplierInvoiceLines = pgTable('supplier_invoice_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => supplierInvoices.id, { onDelete: 'cascade' }),
  sku: text('sku').notNull(),
  productName: text('product_name').notNull(),
  quantity: integer('quantity').notNull(),
  unitCost: numeric('unit_cost', { precision: 12, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
})

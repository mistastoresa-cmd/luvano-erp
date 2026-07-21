import { pgTable, uuid, text, integer, numeric } from 'drizzle-orm/pg-core'
import { purchaseOrders } from './purchase-orders'

export const purchaseOrderLines = pgTable('purchase_order_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  purchaseOrderId: uuid('purchase_order_id')
    .notNull()
    .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  sku: text('sku').notNull(),
  productName: text('product_name').notNull(),
  quantityOrdered: integer('quantity_ordered').notNull(),
  unitCost: numeric('unit_cost', { precision: 12, scale: 2 }).notNull(),
})

import { pgTable, uuid, text, integer, numeric } from 'drizzle-orm/pg-core'
import { goodsReceipts } from './goods-receipts'
import { purchaseOrderLines } from './purchase-order-lines'
import { inventoryMovements } from './inventory-movements'

// نفس نمط sale_invoice_lines.inventoryMovementId: كل بند استلام يشير لحركة
// المخزون اللي ولّدها (زيادة موجبة)، لإغلاق الحلقة بين المستندات والمخزون
// الفعلي — هذا الربط منطق تطبيق مستقبلي (توليد الحركة عند ترحيل الاستلام)،
// العمود هنا فقط يحجز مكانه بالschema.
export const goodsReceiptLines = pgTable('goods_receipt_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  goodsReceiptId: uuid('goods_receipt_id')
    .notNull()
    .references(() => goodsReceipts.id, { onDelete: 'cascade' }),
  purchaseOrderLineId: uuid('purchase_order_line_id').references(() => purchaseOrderLines.id),
  sku: text('sku').notNull(),
  quantityReceived: integer('quantity_received').notNull(),
  unitCost: numeric('unit_cost', { precision: 12, scale: 2 }).notNull(),
  inventoryMovementId: uuid('inventory_movement_id').references(() => inventoryMovements.id),
})

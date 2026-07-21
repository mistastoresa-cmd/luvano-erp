import { pgTable, uuid, text, date, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { branches } from './branches'
import { purchaseOrders } from './purchase-orders'

// الاستلام الفعلي بالفرع. purchaseOrderId اختياري — استلام بلا أمر شراء
// مسبق (مثلاً شراء عاجل من السوق المحلي) وارد وليس خطأ.
export const goodsReceipts = pgTable(
  'goods_receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id),
    receiptNumber: text('receipt_number').notNull(),
    receivedDate: date('received_date').notNull(),
    status: text('status', { enum: ['draft', 'completed'] })
      .notNull()
      .default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('goods_receipts_tenant_receipt_number_idx').on(table.tenantId, table.receiptNumber),
  ]
)

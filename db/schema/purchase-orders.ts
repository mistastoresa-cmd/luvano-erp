import { pgTable, uuid, text, date, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { branches } from './branches'
import { suppliers } from './suppliers'

// أول حلقة في دورة المشتريات: PO → استلام → فاتورة مورد → دفع.
export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    // الفرع المستلِم المتوقَّع — مرجعي فقط، الاستلام الفعلي مسجَّل بجدول
    // goods_receipts (قد يختلف الفرع الفعلي عن المخطَّط).
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    poNumber: text('po_number').notNull(),
    status: text('status', {
      enum: ['draft', 'sent', 'partially_received', 'received', 'cancelled'],
    })
      .notNull()
      .default('draft'),
    orderDate: date('order_date').notNull(),
    expectedDate: date('expected_date'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('purchase_orders_tenant_po_number_idx').on(table.tenantId, table.poNumber)]
)

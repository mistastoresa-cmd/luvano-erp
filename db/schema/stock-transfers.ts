import { pgTable, uuid, text, date, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { branches } from './branches'

// تحويل مخزون من مستودع/فرع لآخر — الآلية القياسية لتوزيع البضاعة من
// المستودع الرئيسي للفروع/المتجر الإلكتروني بدل استقبال كل فرع للمورّد
// مباشرة (انظر النقاش في docs/ARCHITECTURE.md حول نموذج المستودع المركزي).
// عند الترحيل (منطق تطبيق مستقبلي)، كل بند تحويل يولّد حركتي مخزون:
// transfer_out من fromBranchId وtransfer_in لـtoBranchId — انظر
// stock_transfer_lines.fromMovementId/toMovementId.
export const stockTransfers = pgTable(
  'stock_transfers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    fromBranchId: uuid('from_branch_id')
      .notNull()
      .references(() => branches.id),
    toBranchId: uuid('to_branch_id')
      .notNull()
      .references(() => branches.id),
    transferNumber: text('transfer_number').notNull(),
    status: text('status', {
      enum: ['draft', 'in_transit', 'completed', 'cancelled'],
    })
      .notNull()
      .default('draft'),
    transferDate: date('transfer_date').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('stock_transfers_tenant_transfer_number_idx').on(
      table.tenantId,
      table.transferNumber
    ),
  ]
)

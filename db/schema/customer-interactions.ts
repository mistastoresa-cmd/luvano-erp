import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { customers } from './customers'

// سجل تعاملات لكل عميل — مكالمة، ملاحظة، شكوى، متابعة بيع. لا يعيد تسجيل
// المبيعات نفسها (تلك موجودة في sale_invoices.customerId) بل يوثّق التواصل
// البشري حول العميل، وهو ما لا يمكن اشتقاقه من جدول الفواتير.
export const customerInteractions = pgTable(
  'customer_interactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    type: text('type', { enum: ['call', 'note', 'complaint', 'follow_up'] }).notNull(),
    summary: text('summary').notNull(),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('customer_interactions_tenant_customer_idx').on(table.tenantId, table.customerId),
  ]
)

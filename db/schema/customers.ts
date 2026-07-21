import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

// كيان CRM أساسي. sale_invoices.customerName/customerPhone (النصية الحرة)
// تبقى كما هي لبيع سريع بلا عميل مسجَّل (walk-in) — customerId هنا اختياري
// ويُضاف كـFK على sale_invoices في migration منفصلة (انظر
// db/schema/sale-invoices.ts) بدل استبدال الحقول النصية، حفاظاً على مرونة
// البيع بلا تسجيل عميل مسبق.
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    // معرّف عميل سلة، لمطابقة عملاء سلة بعميل لوفانو نفسه لاحقاً عند الربط الحي.
    sallaCustomerId: text('salla_customer_id'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('customers_tenant_salla_customer_idx').on(table.tenantId, table.sallaCustomerId),
  ]
)

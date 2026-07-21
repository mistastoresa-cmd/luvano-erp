import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

export const suppliers = pgTable('suppliers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  name: text('name').notNull(),
  contactName: text('contact_name'),
  phone: text('phone'),
  email: text('email'),
  // الرقم الضريبي (VAT) للمورّد — مطلوب لاحقاً لمطابقة فواتير المشتريات مع
  // متطلبات الامتثال الضريبي، لا يُتحقق من صيغته في هذي المرحلة.
  taxNumber: text('tax_number'),
  // مهلة السداد الافتراضية بالأيام (0 = نقدي فوري) — تُستخدم لاحقاً لحساب
  // تاريخ استحقاق فاتورة المورّد تلقائياً.
  paymentTermsDays: integer('payment_terms_days').notNull().default(0),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

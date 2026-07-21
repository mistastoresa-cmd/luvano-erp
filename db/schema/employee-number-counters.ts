import { pgTable, uuid, integer } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

// عداد ذري لكل مستأجر — يولّد الرقم الوظيفي التسلسلي التالي عبر
// INSERT...ON CONFLICT DO UPDATE SET next_number = next_number + 1 RETURNING
// (نفس نمط "atomic relative update" المستخدم بـ applyInventoryDelta و
// redeemCoupon)، بدل قراءة-ثم-كتابة اللي تنكسر تحت تسجيل موظفين متزامن.
export const employeeNumberCounters = pgTable('employee_number_counters', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id),
  nextNumber: integer('next_number').notNull().default(1),
})

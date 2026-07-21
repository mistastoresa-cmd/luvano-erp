import { pgTable, uuid, text, numeric, date, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { branches } from './branches'

export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    // موقع العمل الأساسي — موظف قد يتنقل بين فروع، لكن هذا مرجعي فقط بهذي
    // المرحلة (بلا سجل تنقلات).
    branchId: uuid('branch_id').references(() => branches.id),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    // رقم الهوية/الإقامة — نص لا رقم، لدعم صيغ متعددة بلا فرض تنسيق مبكراً.
    nationalId: text('national_id'),
    jobTitle: text('job_title'),
    hireDate: date('hire_date').notNull(),
    baseSalary: numeric('base_salary', { precision: 12, scale: 2 }).notNull(),
    status: text('status', { enum: ['active', 'on_leave', 'terminated'] })
      .notNull()
      .default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('employees_tenant_national_id_idx').on(table.tenantId, table.nationalId)]
)

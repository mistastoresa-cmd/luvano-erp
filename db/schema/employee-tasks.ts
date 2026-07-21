import { pgTable, uuid, text, date, timestamp, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { employees } from './employees'

// المهام الوظيفية المُسندة للموظف — ما يُتوقَّع منه إنجازه، يظهر له كمرجع
// (عبر listEmployeeTasks). بسيطة عمداً بهذي المرحلة (بلا أولوية/فئة) —
// نقطة انطلاق، مو نظام إدارة مهام كامل.
export const employeeTasks = pgTable(
  'employee_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    title: text('title').notNull(),
    description: text('description'),
    dueDate: date('due_date'),
    status: text('status', { enum: ['pending', 'in_progress', 'done', 'cancelled'] })
      .notNull()
      .default('pending'),
    assignedBy: text('assigned_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('employee_tasks_tenant_employee_idx').on(table.tenantId, table.employeeId)]
)

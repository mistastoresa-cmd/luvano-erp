import { pgTable, uuid, text, date, timestamp } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { employees } from './employees'

export const leaveRequests = pgTable('leave_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  employeeId: uuid('employee_id')
    .notNull()
    .references(() => employees.id),
  leaveType: text('leave_type', {
    enum: ['annual', 'sick', 'unpaid', 'other'],
  }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] })
    .notNull()
    .default('pending'),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

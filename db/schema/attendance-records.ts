import { pgTable, uuid, text, date, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { employees } from './employees'

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    workDate: date('work_date').notNull(),
    checkIn: timestamp('check_in', { withTimezone: true }),
    checkOut: timestamp('check_out', { withTimezone: true }),
    status: text('status', {
      enum: ['present', 'absent', 'late', 'holiday'],
    }).notNull(),
    notes: text('notes'),
  },
  (table) => [
    uniqueIndex('attendance_records_tenant_employee_date_idx').on(
      table.tenantId,
      table.employeeId,
      table.workDate
    ),
  ]
)

import { pgTable, uuid, text, numeric, timestamp, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { employees } from './employees'

// المخاطبات الرسمية الموجَّهة للموظف — خطاب/تنويه/إنذار/خصم. acknowledgedAt
// يوثّق إقرار استلام الموظف (ممارسة HR قياسية للخطابات الرسمية، خصوصاً
// الإنذارات قبل أي إجراء تأديبي لاحق). خطاب الخصم relatedAmount لا يُطبَّق
// تلقائياً على الرواتب — يبقى مرجعاً يُدخله المستخدم يدوياً كـ deduction
// ضمن EmployeePayrollAdjustment عند lib/hr/service.ts::processPayrollRun.
export const employeeNotifications = pgTable(
  'employee_notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    type: text('type', {
      enum: ['warning', 'commendation', 'notice', 'deduction', 'other'],
    }).notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    relatedAmount: numeric('related_amount', { precision: 12, scale: 2 }),
    issuedBy: text('issued_by'),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    status: text('status', { enum: ['sent', 'acknowledged'] })
      .notNull()
      .default('sent'),
  },
  (table) => [index('employee_notifications_tenant_employee_idx').on(table.tenantId, table.employeeId)]
)

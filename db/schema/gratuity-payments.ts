import { pgTable, uuid, text, numeric, date, timestamp } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { employees } from './employees'
import { journalEntries } from './journal-entries'

// مكافأة نهاية الخدمة (م. ٨٤/٨٥ من نظام العمل). سجل واحد لكل تسوية نهاية
// خدمة — applicablePercent يجسّد تخفيض الاستقالة (0/33.33/66.67/100)،
// grossAmount = صيغة نصف شهر × سنة لأول ٥ سنوات + شهر كامل × سنة بعدها قبل
// أي تخفيض، netAmount = بعد applicablePercent.
export const gratuityPayments = pgTable('gratuity_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  employeeId: uuid('employee_id')
    .notNull()
    .references(() => employees.id),
  terminationDate: date('termination_date').notNull(),
  terminationReason: text('termination_reason', {
    enum: ['resignation', 'employer_termination', 'contract_end', 'other'],
  }).notNull(),
  yearsOfService: numeric('years_of_service', { precision: 6, scale: 2 }).notNull(),
  baseSalaryAtTermination: numeric('base_salary_at_termination', { precision: 12, scale: 2 }).notNull(),
  applicablePercent: numeric('applicable_percent', { precision: 5, scale: 2 }).notNull(),
  grossAmount: numeric('gross_amount', { precision: 12, scale: 2 }).notNull(),
  netAmount: numeric('net_amount', { precision: 12, scale: 2 }).notNull(),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

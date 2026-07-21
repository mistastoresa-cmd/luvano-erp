import { pgTable, uuid, numeric } from 'drizzle-orm/pg-core'
import { payrollRuns } from './payroll-runs'
import { employees } from './employees'
import { journalEntries } from './journal-entries'

export const payrollEntries = pgTable('payroll_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  payrollRunId: uuid('payroll_run_id')
    .notNull()
    .references(() => payrollRuns.id, { onDelete: 'cascade' }),
  employeeId: uuid('employee_id')
    .notNull()
    .references(() => employees.id),
  baseSalary: numeric('base_salary', { precision: 12, scale: 2 }).notNull(),
  allowances: numeric('allowances', { precision: 12, scale: 2 }).notNull().default('0'),
  deductions: numeric('deductions', { precision: 12, scale: 2 }).notNull().default('0'),
  netPay: numeric('net_pay', { precision: 12, scale: 2 }).notNull(),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
})

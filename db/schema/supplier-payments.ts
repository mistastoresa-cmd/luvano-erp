import { pgTable, uuid, text, numeric, date, timestamp } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { suppliers } from './suppliers'
import { supplierInvoices } from './supplier-invoices'
import { journalEntries } from './journal-entries'

// supplierInvoiceId اختياري — دفعة على الحساب (on-account) بلا فاتورة محددة
// واردة، تُخصَّص لفاتورة لاحقاً (منطق تطبيق مستقبلي).
export const supplierPayments = pgTable('supplier_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  supplierId: uuid('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  supplierInvoiceId: uuid('supplier_invoice_id').references(() => supplierInvoices.id),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  paymentDate: date('payment_date').notNull(),
  method: text('method', {
    enum: ['cash', 'bank_transfer', 'card', 'cheque'],
  }).notNull(),
  reference: text('reference'),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

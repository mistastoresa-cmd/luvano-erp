import {
  pgTable,
  uuid,
  text,
  numeric,
  date,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { branches } from './branches'
import { chartOfAccounts } from './chart-of-accounts'
import { bankAccounts } from './bank-accounts'
import { suppliers } from './suppliers'
import { journalEntries } from './journal-entries'
import { costCenters } from './cost-centers'

// طرق الدفع المشتركة لكل حركة مالية (مصروف، دفعة مورد، أي سداد):
// - cash: من الصندوق/النقدية
// - bank: تحويل من حساب بنكي محدد (يتطلب bankAccountId)
// - cheque: شيك مسحوب على حساب بنكي (يتطلب bankAccountId + رقم/استحقاق)
// - credit: على الحساب (آجل) — يُقيَّد على الذمم الدائنة ولا يُخرج نقداً الآن
export const paymentMethods = ['cash', 'bank', 'cheque', 'credit'] as const
export type PaymentMethod = (typeof paymentMethods)[number]

// المصروفات — كل مصروف يُقيَّد مديناً على حساب مصروف من شجرة الحسابات
// (expenseAccountId) ودائناً على مصدر الدفع (نقدية/بنك/ذمم دائنة) حسب
// paymentMethod. القيد يُنشأ عند الترحيل ويُربط عبر journalEntryId — نفس نمط
// sale_invoices/supplier_invoices (حالة "قبل/بعد الترحيل" ظاهرة صراحة).
export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    // اختياري — مصروف مركزي لا يخص فرعاً محدداً.
    branchId: uuid('branch_id').references(() => branches.id),
    // بُعد تحليلي مستقل عن الفرع (انظر cost-centers.ts).
    costCenterId: uuid('cost_center_id').references(() => costCenters.id),
    expenseNumber: text('expense_number').notNull(),
    expenseDate: date('expense_date').notNull(),
    // حساب المصروف من الشجرة (نوعه expense) — مدين القيد.
    expenseAccountId: uuid('expense_account_id')
      .notNull()
      .references(() => chartOfAccounts.id),
    description: text('description'),
    // المبلغ قبل الضريبة، وضريبة المدخلات (قابلة للاسترداد) منفصلة.
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    taxAmount: numeric('tax_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    paymentMethod: text('payment_method', { enum: paymentMethods }).notNull(),
    // مطلوب عند الدفع بنكي/شيك.
    bankAccountId: uuid('bank_account_id').references(() => bankAccounts.id),
    chequeNumber: text('cheque_number'),
    chequeDueDate: date('cheque_due_date'),
    // المورد/الجهة المستفيدة (اختياري).
    supplierId: uuid('supplier_id').references(() => suppliers.id),
    beneficiary: text('beneficiary'),
    status: text('status', { enum: ['draft', 'posted', 'voided'] })
      .notNull()
      .default('draft'),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('expenses_tenant_number_idx').on(table.tenantId, table.expenseNumber),
    index('expenses_tenant_date_idx').on(table.tenantId, table.expenseDate),
  ]
)

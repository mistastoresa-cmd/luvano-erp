import { pgTable, uuid, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { branches } from './branches'

// رأس القيد المحاسبي. القيد نفسه (مجموع مدين = مجموع دائن) هو ثابت محاسبي
// (invariant) يُفرض على مستوى منطق التطبيق عند إنشاء القيد مع بنوده معاً
// (خارج نطاق هذي المرحلة — schema فقط، بلا خدمة/منطق تطبيق بعد)، مو قيد SQL
// على مستوى الجدول — نفس نمط "الذرية عبر transaction في خدمة التطبيق" المستخدم
// بالفعل في lib/ledger/service.ts للفواتير وحركات المخزون.
export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    // فرع اختياري — بعض القيود (مثل مصاريف مركزية) لا تخص فرعاً محدداً.
    branchId: uuid('branch_id').references(() => branches.id),
    entryNumber: text('entry_number').notNull(),
    entryDate: timestamp('entry_date', { withTimezone: true }).notNull(),
    description: text('description'),
    // مصدر القيد — يدوي أو مُولَّد آليًا من مستند آخر (فاتورة بيع، فاتورة
    // شراء، تعديل مخزون...). sourceReference يحمل معرف ذلك المستند نصياً،
    // بنفس نمط inventory_movements.sourceReference.
    sourceType: text('source_type', {
      enum: [
        'manual',
        'sale_invoice',
        'purchase_invoice',
        'supplier_payment',
        'payroll',
        'adjustment',
        'system',
      ],
    }).notNull(),
    sourceReference: text('source_reference'),
    status: text('status', { enum: ['draft', 'posted', 'voided'] })
      .notNull()
      .default('draft'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('journal_entries_tenant_entry_number_idx').on(table.tenantId, table.entryNumber),
    index('journal_entries_tenant_date_idx').on(table.tenantId, table.entryDate),
    // Idempotency guard for auto-posted entries (postSupplierInvoiceJournal,
    // postSaleInvoiceJournal, etc): re-posting the same source document must
    // not create a second entry. NULLs are distinct in a Postgres unique
    // index, so manual entries (sourceReference always null) are unaffected.
    uniqueIndex('journal_entries_tenant_source_idx')
      .on(table.tenantId, table.sourceType, table.sourceReference)
      .where(sql`${table.sourceReference} IS NOT NULL`),
  ]
)

import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { chartOfAccounts } from './chart-of-accounts'

// يحل مشكلة "كيف يعرف النظام أي حساب من شجرة الحسابات هو 'الذمم الدائنة' أو
// 'المخزون' لتينانت معين" — بدون هذا الربط، الترحيل التلقائي للقيود (فاتورة
// مورد/بيع ← قيد) ما له معنى محدد، لأن كل تينانت يبني شجرة حسابات مختلفة.
// key ثابت (مو نص حر) عشان lib/accounting/service.ts يقدر يبحث عنه برمجياً.
export const accountMappingKeys = [
  'cash',
  'accounts_receivable',
  'accounts_payable',
  'inventory_asset',
  'sales_revenue',
  'cogs',
  'input_tax',
  'output_tax_payable',
  'salary_expense',
  'salary_payable',
  'gratuity_expense',
  'gratuity_payable',
] as const

export const accountMappings = pgTable(
  'account_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    key: text('key', { enum: accountMappingKeys }).notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => chartOfAccounts.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('account_mappings_tenant_key_idx').on(table.tenantId, table.key)]
)

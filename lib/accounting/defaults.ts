import { eq, and } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { chartOfAccounts, accountMappings } from '@/db/schema'
import type { AccountMappingKey } from './types'

type AccountType = 'asset' | 'liability' | 'revenue' | 'expense'

// The mapped core: every account an auto-posting path resolves by key
// (postSaleInvoiceJournal, postSupplierInvoiceJournal, payroll/gratuity).
// Without these, posting fails with "no account mapped for key ..." — the
// exact gap that existed when only scripts/seed.ts created them and the live
// /api/onboarding path did not.
//
// Codes follow a conventional ledger layout (1xxx assets, 2xxx liabilities,
// 4xxx revenue, 5xxx expense). A tenant can rename/restructure later; this is
// a working default, not a locked schema.
export const DEFAULT_CHART_OF_ACCOUNTS: {
  key: AccountMappingKey
  code: string
  name: string
  type: AccountType
}[] = [
  { key: 'cash', code: '1000', name: 'الصندوق والبنوك', type: 'asset' },
  { key: 'inventory_asset', code: '1100', name: 'المخزون', type: 'asset' },
  { key: 'accounts_receivable', code: '1200', name: 'ذمم العملاء', type: 'asset' },
  { key: 'input_tax', code: '1300', name: 'ضريبة القيمة المضافة على المشتريات', type: 'asset' },
  { key: 'accounts_payable', code: '2000', name: 'ذمم الموردين', type: 'liability' },
  { key: 'output_tax_payable', code: '2100', name: 'ضريبة القيمة المضافة المستحقة', type: 'liability' },
  { key: 'salary_payable', code: '2200', name: 'رواتب مستحقة', type: 'liability' },
  { key: 'gratuity_payable', code: '2300', name: 'مكافأة نهاية الخدمة المستحقة', type: 'liability' },
  { key: 'sales_revenue', code: '4000', name: 'إيرادات المبيعات', type: 'revenue' },
  { key: 'cogs', code: '5000', name: 'تكلفة البضاعة المباعة', type: 'expense' },
  { key: 'salary_expense', code: '5100', name: 'مصروف الرواتب', type: 'expense' },
  { key: 'gratuity_expense', code: '5200', name: 'مصروف مكافأة نهاية الخدمة', type: 'expense' },
]

// Operating-expense accounts a real retail business books against day to day.
// These carry NO mapping key on purpose — nothing posts to them
// automatically; the user picks one when recording an expense
// (lib/expenses). Grouped by 5xxx band: 53 premises, 54 selling, 55
// government/insurance, 56 financial, 57 professional/depreciation, 58
// admin, 59 other.
export const DEFAULT_EXPENSE_ACCOUNTS: { code: string; name: string }[] = [
  { code: '5300', name: 'إيجارات' },
  { code: '5310', name: 'كهرباء ومياه' },
  { code: '5320', name: 'اتصالات وإنترنت' },
  { code: '5330', name: 'صيانة وإصلاحات' },
  { code: '5340', name: 'نظافة وخدمات المقر' },
  { code: '5350', name: 'قرطاسية ولوازم مكتبية' },
  { code: '5400', name: 'تسويق وإعلان' },
  { code: '5410', name: 'عمولات مبيعات' },
  { code: '5420', name: 'شحن وتوصيل' },
  { code: '5430', name: 'مواد تغليف' },
  { code: '5440', name: 'عمولات منصات البيع' },
  { code: '5500', name: 'رسوم حكومية واشتراكات' },
  { code: '5510', name: 'التأمينات الاجتماعية' },
  { code: '5520', name: 'تأمين طبي' },
  { code: '5530', name: 'رسوم تأشيرات وإقامات' },
  { code: '5600', name: 'مصاريف وعمولات بنكية' },
  { code: '5610', name: 'فروقات عملة' },
  { code: '5700', name: 'إهلاك الأصول الثابتة' },
  { code: '5710', name: 'أتعاب مهنية واستشارات' },
  { code: '5720', name: 'مصاريف قانونية' },
  { code: '5800', name: 'ضيافة وبوفيه' },
  { code: '5810', name: 'سفر وانتقالات' },
  { code: '5820', name: 'تدريب وتطوير' },
  { code: '5900', name: 'مصروفات أخرى' },
]

// Accepts any drizzle handle over the app schema — the pglite dev db
// (scripts/seed.ts) and the neon transaction inside provisionTenant both
// satisfy this, so the two callers share one definition instead of drifting.
type AppDb = PgDatabase<any, typeof schema>

// Idempotent: skips any code already present and any key already mapped, so
// it doubles as a "top up my chart with whatever defaults are missing"
// operation for tenants provisioned before new defaults were added — not
// only a one-shot bootstrap. Returns how many rows it actually created.
export async function seedDefaultChartOfAccounts(
  db: AppDb,
  tenantId: string
): Promise<{ accountsCreated: number; mappingsCreated: number }> {
  const existingAccounts = await db
    .select({ id: chartOfAccounts.id, code: chartOfAccounts.code })
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.tenantId, tenantId))
  const byCode = new Map(existingAccounts.map((a) => [a.code, a.id]))

  const existingMappings = await db
    .select({ key: accountMappings.key })
    .from(accountMappings)
    .where(eq(accountMappings.tenantId, tenantId))
  const mappedKeys = new Set(existingMappings.map((m) => m.key))

  let accountsCreated = 0
  let mappingsCreated = 0

  async function ensureAccount(code: string, name: string, type: AccountType): Promise<string> {
    const existing = byCode.get(code)
    if (existing) return existing
    const [row] = await db
      .insert(chartOfAccounts)
      .values({ tenantId, code, name, type })
      .returning({ id: chartOfAccounts.id })
    byCode.set(code, row.id)
    accountsCreated++
    return row.id
  }

  for (const a of DEFAULT_CHART_OF_ACCOUNTS) {
    const accountId = await ensureAccount(a.code, a.name, a.type)
    if (!mappedKeys.has(a.key)) {
      await db.insert(accountMappings).values({ tenantId, key: a.key, accountId })
      mappedKeys.add(a.key)
      mappingsCreated++
    }
  }

  for (const e of DEFAULT_EXPENSE_ACCOUNTS) {
    await ensureAccount(e.code, e.name, 'expense')
  }

  return { accountsCreated, mappingsCreated }
}

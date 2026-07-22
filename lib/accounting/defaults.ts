import type { PgDatabase } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { chartOfAccounts, accountMappings } from '@/db/schema'
import type { AccountMappingKey } from './types'

// The minimal starter chart of accounts every new tenant needs so that the
// auto-posting paths (postSaleInvoiceJournal, postSupplierInvoiceJournal,
// payroll/gratuity) have a real account to resolve each account_mappings key
// to. Without these, a merchant could create a sale invoice but posting its
// journal entry would fail with "no account mapped for key ..." — which is
// exactly the gap that existed when only scripts/seed.ts (dev demo data)
// created these rows and the live /api/onboarding path did not.
//
// Codes follow a conventional ledger layout (1xxx assets, 2xxx liabilities,
// 4xxx revenue, 5xxx expense). A tenant can rename/restructure later once the
// accounting-module UI exists; this is a working default, not a locked schema.
export const DEFAULT_CHART_OF_ACCOUNTS: {
  key: AccountMappingKey
  code: string
  name: string
  type: 'asset' | 'liability' | 'revenue' | 'expense'
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

// Accepts any drizzle handle over the app schema — the pglite dev db
// (scripts/seed.ts) and the neon transaction inside provisionTenant both
// satisfy this, so the two callers share one definition instead of drifting.
type AppDb = PgDatabase<any, typeof schema>

export async function seedDefaultChartOfAccounts(db: AppDb, tenantId: string): Promise<void> {
  for (const a of DEFAULT_CHART_OF_ACCOUNTS) {
    const [account] = await db
      .insert(chartOfAccounts)
      .values({ tenantId, code: a.code, name: a.name, type: a.type })
      .returning()
    await db.insert(accountMappings).values({ tenantId, key: a.key, accountId: account.id })
  }
}

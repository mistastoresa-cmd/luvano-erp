import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { chartOfAccounts } from './chart-of-accounts'

// حسابات البنوك — بيانات البنك التفصيلية (اسم البنك، رقم الحساب، الآيبان)
// مربوطة بحساب أصل في شجرة الحسابات (chartAccountId). كل حركة دفع/قبض عبر
// هذا البنك تُرحَّل على ذلك الحساب تحديداً، فيصير رصيد البنك في الشجرة
// انعكاساً حقيقياً لحركته بدل حساب "نقدية" واحد مجمّع.
export const bankAccounts = pgTable(
  'bank_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    // اسم البنك (الراجحي، الأهلي...).
    bankName: text('bank_name').notNull(),
    // اسم الحساب لدى البنك (اسم صاحب الحساب/الوصف).
    accountName: text('account_name'),
    accountNumber: text('account_number'),
    iban: text('iban'),
    swift: text('swift'),
    currency: text('currency').notNull().default('SAR'),
    // حساب الأصل المقابل في شجرة الحسابات — إلزامي حتى لا يوجد بنك بلا أثر
    // محاسبي.
    chartAccountId: uuid('chart_account_id')
      .notNull()
      .references(() => chartOfAccounts.id),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('bank_accounts_tenant_idx').on(table.tenantId)]
)

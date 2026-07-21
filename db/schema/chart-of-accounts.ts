import { pgTable, uuid, text, boolean, timestamp, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

// شجرة الحسابات — هيكل هرمي عبر parentId (حساب رئيسي ← حسابات فرعية)، على غرار
// أي دليل حسابات محاسبي قياسي. لا حسابات افتراضية مزروعة هنا (seed) — كل تينانت
// يبني شجرته الخاصة أو يستورد قالب جاهز، خارج نطاق هذي المرحلة (schema فقط).
export const chartOfAccounts = pgTable(
  'chart_of_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    // رقم الحساب المحاسبي (مثلاً 1010 للنقدية) — رمز عرض/فرز، مو مفتاح داخلي.
    code: text('code').notNull(),
    name: text('name').notNull(),
    type: text('type', {
      enum: ['asset', 'liability', 'equity', 'revenue', 'expense'],
    }).notNull(),
    // مرجع ذاتي لبناء الشجرة الهرمية — حساب رئيسي بلا parentId، حسابات فرعية
    // تشير لأبيها. النوع AnyPgColumn هو نمط drizzle القياسي للـFK الذاتي
    // (self-referencing)، يتفادى مشكلة "الجدول يشير لنفسه قبل ما يوجد".
    parentId: uuid('parent_id').references((): AnyPgColumn => chartOfAccounts.id),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('chart_of_accounts_tenant_code_idx').on(table.tenantId, table.code)]
)

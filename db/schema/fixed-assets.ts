import { pgTable, uuid, text, numeric, integer, date, timestamp } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { branches } from './branches'
import { chartOfAccounts } from './chart-of-accounts'

// الأصول الثابتة — سجل الأصل + إعداد الإهلاك الأساسي (طريقة القسط الثابت
// straight-line هي الافتراض الشائع لمعظم SMB؛ طرق أخرى تُضاف لاحقاً لو
// احتاجها تاجر معين). حساب قيود الإهلاك الدورية نفسه (توليد journal_entries
// شهرية) هو منطق تطبيق مستقبلي، خارج نطاق هذي المرحلة.
export const fixedAssets = pgTable('fixed_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  branchId: uuid('branch_id').references(() => branches.id),
  name: text('name').notNull(),
  assetAccountId: uuid('asset_account_id').references(() => chartOfAccounts.id),
  depreciationAccountId: uuid('depreciation_account_id').references(() => chartOfAccounts.id),
  purchaseCost: numeric('purchase_cost', { precision: 12, scale: 2 }).notNull(),
  purchaseDate: date('purchase_date').notNull(),
  usefulLifeMonths: integer('useful_life_months').notNull(),
  salvageValue: numeric('salvage_value', { precision: 12, scale: 2 }).notNull().default('0'),
  depreciationMethod: text('depreciation_method', { enum: ['straight_line'] })
    .notNull()
    .default('straight_line'),
  status: text('status', { enum: ['active', 'disposed', 'fully_depreciated'] })
    .notNull()
    .default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

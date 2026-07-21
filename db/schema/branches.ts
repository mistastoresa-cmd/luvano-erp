import { pgTable, uuid, text, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'

export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    // Short human code, e.g. "RIYADH-01" — also serves as the "warehouse
    // number" for inventory purposes; every branch already tracks its own
    // stock (inventory_balances is keyed by branch_id regardless of
    // branches.type), so no separate warehouse-number field is needed.
    code: text('code').notNull(),
    // Distinct from `code` — the branch's reference number *as a reporting
    // dimension* in accounting (like a cost-center code). Every auto-posted
    // journal entry (lib/accounting/service.ts) carries journal_entries.branchId,
    // so P&L/balance-sheet reports can filter by this branch without needing
    // separate per-branch accounts in the chart of accounts. Nullable — a
    // branch can exist before its accounting code is assigned.
    accountingCode: text('accounting_code'),
    // Exactly one 'online' branch per tenant represents the Salla storefront itself,
    // so Salla-sourced movements/invoices have a branch_id to point at like everything
    // else — no special-cased nullable branch column anywhere downstream.
    // 'warehouse' is a central receiving location — purchases land there by default
    // and get transferred out to 'physical'/'online' branches via stock_transfers,
    // rather than each branch receiving supplier deliveries directly.
    type: text('type', { enum: ['physical', 'online', 'warehouse'] }).notNull(),
    // At most one default warehouse per tenant (enforced by the partial unique
    // index below) — the receiving location purchase_orders/goods_receipts
    // default to unless a purchase is explicitly a direct-to-branch exception.
    isDefaultWarehouse: boolean('is_default_warehouse').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('branches_tenant_code_idx').on(table.tenantId, table.code),
    uniqueIndex('branches_tenant_default_warehouse_idx')
      .on(table.tenantId, table.isDefaultWarehouse)
      .where(sql`${table.isDefaultWarehouse} = true`),
    uniqueIndex('branches_tenant_accounting_code_idx')
      .on(table.tenantId, table.accountingCode)
      .where(sql`${table.accountingCode} IS NOT NULL`),
  ]
)

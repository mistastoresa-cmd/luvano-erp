import { pgTable, uuid, text, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    // Short human code, e.g. "RIYADH-01".
    code: text('code').notNull(),
    // Exactly one 'online' branch per tenant represents the Salla storefront itself,
    // so Salla-sourced movements/invoices have a branch_id to point at like everything
    // else — no special-cased nullable branch column anywhere downstream.
    type: text('type', { enum: ['physical', 'online'] }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('branches_tenant_code_idx').on(table.tenantId, table.code)]
)

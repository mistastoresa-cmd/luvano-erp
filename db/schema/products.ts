import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

// The "parent" in the parent/child product model — a real product row exists
// even for a simple item with no color/size variation (see
// product-variants.ts: every product has at least one variant row, so all 8
// existing tables that reference a SKU as flat text never need to change —
// they just keep pointing at product_variants.sku, whether that variant is
// the only one under its product or one of many).
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    category: text('category'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('products_tenant_idx').on(table.tenantId)]
)

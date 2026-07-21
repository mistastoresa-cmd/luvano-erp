import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { products } from './products'

// The "child" — the actual SKU holder. A simple (non-variant) product still
// gets exactly one row here (attributes: {}); a clothing/shoes-style product
// gets one row per color/size combination.
//
// Deliberately NOT a foreign key target from the 8 existing sku-bearing
// tables (inventory_movements, inventory_balances, sale_invoice_lines,
// purchase_order_lines, goods_receipt_lines, supplier_invoice_lines,
// stock_transfer_lines, reconciliation_alerts) — those keep their existing
// free-text sku columns unchanged. This table is a reference/lookup catalog
// (product name, category, attributes for a SKU), not an enforced
// referential-integrity constraint. Trade-off made deliberately to avoid
// migrating 8 already-built, already-tested tables for this module — a SKU
// can exist in inventory before it's registered here, same as today.
export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    // Generic key-value (e.g. {"color":"black","size":"40"}) rather than
    // fixed color/size columns — variant axes differ by business type
    // (clothes: color+size; perfume: volume; electronics: storage/color...).
    attributes: jsonb('attributes').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('product_variants_tenant_sku_idx').on(table.tenantId, table.sku),
    index('product_variants_product_idx').on(table.productId),
  ]
)

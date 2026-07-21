import { pgTable, uuid, text, numeric, integer, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { products } from './products'
import { productVariants } from './product-variants'

// كوبون خصم. sallaCouponCode اختياري — كثير من التجار ينشئون الكوبون فعلياً
// داخل سلة نفسها (تتحكم فيه بوابة سلة)، وهذا العمود يربط سجل لوفانو بذلك
// الكود لأغراض التقارير/التحليل، لا لإدارة الكوبون حصرياً من لوفانو.
export const coupons = pgTable(
  'coupons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    code: text('code').notNull(),
    sallaCouponCode: text('salla_coupon_code'),
    discountType: text('discount_type', { enum: ['percentage', 'fixed_amount'] }).notNull(),
    discountValue: numeric('discount_value', { precision: 12, scale: 2 }).notNull(),
    // Targeting per the founder's requirement: NULL on both = applies to the
    // whole cart. targetProductId = every variant under that product (the
    // parent case). targetVariantId = exactly one SKU (the "size 40, black
    // only" case). Only one of the two is ever set — enforced at the
    // application layer (lib/marketing/service.ts), not a DB CHECK
    // constraint, matching this schema's existing convention for
    // cross-field invariants (see db/schema/journal-entries.ts's comment on
    // the debit=credit invariant).
    targetProductId: uuid('target_product_id').references(() => products.id),
    targetVariantId: uuid('target_variant_id').references(() => productVariants.id),
    minOrderAmount: numeric('min_order_amount', { precision: 12, scale: 2 }),
    maxUses: integer('max_uses'),
    usesCount: integer('uses_count').notNull().default(0),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('coupons_tenant_code_idx').on(table.tenantId, table.code)]
)

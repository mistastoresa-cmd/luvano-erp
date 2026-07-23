import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

// العروض الترويجية — تختلف عن الكوبونات (coupons): الكوبون يحتاج كوداً يُدخله
// العميل، أما العرض الترويجي فيُطبَّق آلياً عند تحقق شرطه. نوع العرض (offerType)
// يحدد شكل config الخاص به، فجدول واحد مرن يغطي كل الأنواع بدل جدول لكل نوع.
//
// config حسب النوع:
// - product_discount: { discountType: 'percentage'|'fixed', value }
// - fixed_price:      { minQty, specialPrice }
// - quantity_tiers:   { tiers: [{ minQty, discountPct }] }
// - buy_x_get_y:      { buyQty, getQty, getDiscountPct }  (get = free اذا 100)
// - loyalty_tier:     { tier: 'bronze'|'silver'|'gold'|'diamond', discountPct }
//
// التطبيق الفعلي عند البيع (خصم الفاتورة) طبقة منفصلة تُبنى مع تدفق فاتورة
// البيع — هذا الجدول يخزّن تعريف العرض فقط.
export const promotionOfferTypes = [
  'product_discount',
  'fixed_price',
  'quantity_tiers',
  'buy_x_get_y',
  'loyalty_tier',
  // عرض بنكي — خصم عند الدفع ببطاقة بنك معيّن.
  // config: { bankName, discountPct, minOrderAmount? }
  'bank_offer',
  // كاش باك — نسبة تُعاد لمحفظة العميل بدل خصم فوري.
  // config: { cashbackPct, maxCashback? }
  'cashback',
] as const

export const promotions = pgTable(
  'promotions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    offerType: text('offer_type', { enum: promotionOfferTypes }).notNull(),
    // إعدادات النوع (انظر التعليق أعلاه) — شكل حر حسب offerType.
    config: jsonb('config').notNull().default({}),
    // الاستهداف الاختياري: منتج/صنف/تصنيف محدد يسري عليه العرض (كلها null =
    // كل المتجر). أولوية المطابقة: المتغيّر ثم المنتج ثم التصنيف.
    targetProductId: uuid('target_product_id'),
    targetVariantId: uuid('target_variant_id'),
    targetCategory: text('target_category'),
    // قيمة الخصم الأساسية (نسخة مسطّحة من config لسهولة العرض في الجداول
    // والتقارير دون فك jsonb — النسبة أو المبلغ أو السعر حسب النوع).
    displayValue: numeric('display_value', { precision: 12, scale: 2 }),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('promotions_tenant_idx').on(table.tenantId)]
)

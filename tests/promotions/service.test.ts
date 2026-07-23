import { describe, it, expect } from 'vitest'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { createPromotionsService } from '@/lib/promotions/service'
import { promotions } from '@/db/schema'
import { SYSTEM_CONTEXT } from '@/lib/authz/types'
import type { CartLine } from '@/lib/promotions/types'

const staff = {
  userId: 'u-staff',
  role: 'staff' as const,
  branchAccess: { type: 'all' as const },
}

async function addPromotion(
  db: Awaited<ReturnType<typeof createTestDb>>,
  tenantId: string,
  values: Partial<typeof promotions.$inferInsert> & {
    name: string
    offerType: typeof promotions.$inferInsert.offerType
    config: object
  }
) {
  const [row] = await db
    .insert(promotions)
    .values({ tenantId, isActive: true, ...values })
    .returning()
  return row
}

const line = (over: Partial<CartLine> = {}): CartLine => ({
  sku: 'SKU-1',
  quantity: 1,
  unitPrice: 100,
  ...over,
})

describe('PromotionsService.applyPromotions', () => {
  it('applies a percentage product discount across the cart', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    await addPromotion(db, tenant.id, {
      name: 'خصم 10%',
      offerType: 'product_discount',
      config: { discountType: 'percentage', value: 10 },
    })

    const res = await createPromotionsService(db).applyPromotions(staff, tenant.id, {
      lines: [line({ quantity: 2, unitPrice: 100 })],
    })

    expect(res.totalDiscount).toBe(20)
    expect(res.appliedPromotions).toHaveLength(1)
  })

  it('drops the unit price to the special price once the quantity threshold is met', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    await addPromotion(db, tenant.id, {
      name: 'سعر ثابت',
      offerType: 'fixed_price',
      config: { minQty: 3, specialPrice: 80 },
    })
    const svc = createPromotionsService(db)

    // Below the threshold — no discount.
    const below = await svc.applyPromotions(staff, tenant.id, {
      lines: [line({ quantity: 2, unitPrice: 100 })],
    })
    expect(below.totalDiscount).toBe(0)

    // At the threshold — every unit drops 100 -> 80.
    const at = await svc.applyPromotions(staff, tenant.id, {
      lines: [line({ quantity: 3, unitPrice: 100 })],
    })
    expect(at.totalDiscount).toBe(60)
  })

  it('picks the highest qualifying tier for quantity tiers', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    await addPromotion(db, tenant.id, {
      name: 'جدول خصومات',
      offerType: 'quantity_tiers',
      config: {
        tiers: [
          { minQty: 3, discountPct: 5 },
          { minQty: 10, discountPct: 20 },
        ],
      },
    })

    const res = await createPromotionsService(db).applyPromotions(staff, tenant.id, {
      lines: [line({ quantity: 10, unitPrice: 100 })],
    })

    // 10 units qualifies for the 20% tier, not the 5% one.
    expect(res.totalDiscount).toBe(200)
  })

  it('gives one free unit per buy-2-get-1 group', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    await addPromotion(db, tenant.id, {
      name: 'اشترِ 2 واحصل على 1',
      offerType: 'buy_x_get_y',
      config: { buyQty: 2, getQty: 1, getDiscountPct: 100 },
    })

    const res = await createPromotionsService(db).applyPromotions(staff, tenant.id, {
      lines: [line({ quantity: 7, unitPrice: 100 })],
    })

    // 7 units = 2 complete groups of 3 -> 2 free units.
    expect(res.totalDiscount).toBe(200)
  })

  it('applies a loyalty-tier discount only to a matching customer tier', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    await addPromotion(db, tenant.id, {
      name: 'خصم الفئة الذهبية',
      offerType: 'loyalty_tier',
      config: { tier: 'gold', discountPct: 30 },
    })
    const svc = createPromotionsService(db)

    const gold = await svc.applyPromotions(staff, tenant.id, {
      lines: [line({ unitPrice: 200 })],
      customerTier: 'gold',
    })
    expect(gold.totalDiscount).toBe(60)

    const silver = await svc.applyPromotions(staff, tenant.id, {
      lines: [line({ unitPrice: 200 })],
      customerTier: 'silver',
    })
    expect(silver.totalDiscount).toBe(0)

    const anonymous = await svc.applyPromotions(staff, tenant.id, {
      lines: [line({ unitPrice: 200 })],
    })
    expect(anonymous.totalDiscount).toBe(0)
  })

  it('ignores promotions outside their date window or switched off', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    await addPromotion(db, tenant.id, {
      name: 'منتهٍ',
      offerType: 'product_discount',
      config: { discountType: 'percentage', value: 50 },
      expiresAt: new Date('2026-01-01'),
    })
    await addPromotion(db, tenant.id, {
      name: 'متوقّف',
      offerType: 'product_discount',
      config: { discountType: 'percentage', value: 50 },
      isActive: false,
    })

    const res = await createPromotionsService(db).applyPromotions(staff, tenant.id, {
      lines: [line()],
      at: new Date('2026-07-20'),
    })

    expect(res.totalDiscount).toBe(0)
    expect(res.appliedPromotions).toHaveLength(0)
  })

  it('limits a targeted promotion to its own product', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const productId = '11111111-1111-1111-1111-111111111111'
    await addPromotion(db, tenant.id, {
      name: 'خصم منتج محدد',
      offerType: 'product_discount',
      config: { discountType: 'percentage', value: 10 },
      targetProductId: productId,
    })

    const res = await createPromotionsService(db).applyPromotions(staff, tenant.id, {
      lines: [
        line({ sku: 'A', productId, quantity: 1, unitPrice: 100 }),
        line({ sku: 'B', productId: '22222222-2222-2222-2222-222222222222', unitPrice: 500 }),
      ],
    })

    // Only the targeted line is discounted (10% of 100), not the 500 line.
    expect(res.totalDiscount).toBe(10)
    expect(res.appliedPromotions[0].affectedSkus).toEqual(['A'])
  })

  it('sums multiple active promotions', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    await addPromotion(db, tenant.id, {
      name: 'خصم 10%',
      offerType: 'product_discount',
      config: { discountType: 'percentage', value: 10 },
    })
    await addPromotion(db, tenant.id, {
      name: 'اشترِ 1 واحصل على 1',
      offerType: 'buy_x_get_y',
      config: { buyQty: 1, getQty: 1, getDiscountPct: 100 },
    })

    const res = await createPromotionsService(db).applyPromotions(SYSTEM_CONTEXT, tenant.id, {
      lines: [line({ quantity: 2, unitPrice: 100 })],
    })

    // 10% of 200 = 20, plus one free unit = 100.
    expect(res.totalDiscount).toBe(120)
    expect(res.appliedPromotions).toHaveLength(2)
  })
})

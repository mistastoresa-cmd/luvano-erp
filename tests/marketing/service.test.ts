import { describe, it, expect } from 'vitest'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { createMarketingService } from '@/lib/marketing/service'
import { SYSTEM_CONTEXT } from '@/lib/authz/types'
import { createProductsService } from '@/lib/products/service'
import { coupons } from '@/db/schema'

describe('MarketingService — untargeted coupons (whole cart)', () => {
  it('validates a percentage coupon against the whole cart', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const marketing = createMarketingService(db)

    await db.insert(coupons).values({
      tenantId: tenant.id,
      code: 'SUMMER10',
      discountType: 'percentage',
      discountValue: '10',
    })

    const result = await marketing.validateCoupon(SYSTEM_CONTEXT, tenant.id, 'SUMMER10', [
      { sku: 'SKU-1', quantity: 2, unitPrice: 50 },
      { sku: 'SKU-2', quantity: 1, unitPrice: 100 },
    ])

    expect(result.valid).toBe(true)
    expect(result.eligibleLines).toHaveLength(2)
    expect(result.discountAmount).toBe(20) // 10% of 200
  })

  it('rejects a coupon that does not exist', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const marketing = createMarketingService(db)

    const result = await marketing.validateCoupon(SYSTEM_CONTEXT, tenant.id, 'NOPE', [])
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('not_found')
  })

  it('rejects an inactive coupon', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const marketing = createMarketingService(db)

    await db.insert(coupons).values({
      tenantId: tenant.id,
      code: 'OFF20',
      discountType: 'fixed_amount',
      discountValue: '20',
      isActive: false,
    })

    const result = await marketing.validateCoupon(SYSTEM_CONTEXT, tenant.id, 'OFF20', [
      { sku: 'SKU-1', quantity: 1, unitPrice: 100 },
    ])
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('inactive')
  })

  it('caps a fixed-amount discount at the eligible total (never goes negative)', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const marketing = createMarketingService(db)

    await db.insert(coupons).values({
      tenantId: tenant.id,
      code: 'BIGOFF',
      discountType: 'fixed_amount',
      discountValue: '500',
    })

    const result = await marketing.validateCoupon(SYSTEM_CONTEXT, tenant.id, 'BIGOFF', [
      { sku: 'SKU-1', quantity: 1, unitPrice: 30 },
    ])
    expect(result.discountAmount).toBe(30)
  })

  it('rejects when the cart is below minOrderAmount', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const marketing = createMarketingService(db)

    await db.insert(coupons).values({
      tenantId: tenant.id,
      code: 'MIN200',
      discountType: 'percentage',
      discountValue: '10',
      minOrderAmount: '200.00',
    })

    const result = await marketing.validateCoupon(SYSTEM_CONTEXT, tenant.id, 'MIN200', [
      { sku: 'SKU-1', quantity: 1, unitPrice: 50 },
    ])
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('min_order_not_met')
  })

  it('rejects an expired coupon', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const marketing = createMarketingService(db)

    await db.insert(coupons).values({
      tenantId: tenant.id,
      code: 'EXPIRED',
      discountType: 'percentage',
      discountValue: '10',
      expiresAt: new Date('2020-01-01'),
    })

    const result = await marketing.validateCoupon(SYSTEM_CONTEXT, tenant.id, 'EXPIRED', [
      { sku: 'SKU-1', quantity: 1, unitPrice: 50 },
    ])
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('expired')
  })
})

describe('MarketingService — targeted coupons (product/variant)', () => {
  it('applies the discount only to the targeted variant, not the whole cart (the "size 40 black only" case)', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const marketing = createMarketingService(db)
    const products = createProductsService(db)

    const { variantIds } = await products.createProduct(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      name: 'Classic Shirt',
      variants: [
        { sku: 'SHIRT-BLK-40', attributes: { color: 'black', size: '40' } },
        { sku: 'SHIRT-BLK-42', attributes: { color: 'black', size: '42' } },
      ],
    })

    await db.insert(coupons).values({
      tenantId: tenant.id,
      code: 'SIZE40BLACK',
      discountType: 'percentage',
      discountValue: '20',
      targetVariantId: variantIds[0], // SHIRT-BLK-40
    })

    const result = await marketing.validateCoupon(SYSTEM_CONTEXT, tenant.id, 'SIZE40BLACK', [
      { sku: 'SHIRT-BLK-40', quantity: 1, unitPrice: 100 },
      { sku: 'SHIRT-BLK-42', quantity: 1, unitPrice: 100 },
    ])

    expect(result.valid).toBe(true)
    expect(result.eligibleLines).toEqual([{ sku: 'SHIRT-BLK-40', quantity: 1, unitPrice: 100 }])
    expect(result.discountAmount).toBe(20) // 20% of 100, not 200
  })

  it('applies the discount to every variant under the targeted product (the "whole parent" case)', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const marketing = createMarketingService(db)
    const products = createProductsService(db)

    const { productId } = await products.createProduct(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      name: 'Classic Shirt',
      variants: [
        { sku: 'SHIRT-BLK-40', attributes: { color: 'black', size: '40' } },
        { sku: 'SHIRT-BLK-42', attributes: { color: 'black', size: '42' } },
      ],
    })

    await db.insert(coupons).values({
      tenantId: tenant.id,
      code: 'ALLSHIRT',
      discountType: 'percentage',
      discountValue: '10',
      targetProductId: productId,
    })

    const result = await marketing.validateCoupon(SYSTEM_CONTEXT, tenant.id, 'ALLSHIRT', [
      { sku: 'SHIRT-BLK-40', quantity: 1, unitPrice: 100 },
      { sku: 'SHIRT-BLK-42', quantity: 1, unitPrice: 100 },
      { sku: 'UNRELATED-SKU', quantity: 1, unitPrice: 50 },
    ])

    expect(result.valid).toBe(true)
    expect(result.eligibleLines).toHaveLength(2)
    expect(result.discountAmount).toBe(20) // 10% of 200 (the two shirt lines only)
  })

  it('rejects when the cart has none of the targeted SKUs', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const marketing = createMarketingService(db)
    const products = createProductsService(db)

    const { variantIds } = await products.createProduct(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      name: 'Classic Shirt',
      variants: [{ sku: 'SHIRT-BLK-40', attributes: { color: 'black', size: '40' } }],
    })

    await db.insert(coupons).values({
      tenantId: tenant.id,
      code: 'SIZE40BLACK',
      discountType: 'percentage',
      discountValue: '20',
      targetVariantId: variantIds[0],
    })

    const result = await marketing.validateCoupon(SYSTEM_CONTEXT, tenant.id, 'SIZE40BLACK', [
      { sku: 'OTHER-SKU', quantity: 1, unitPrice: 100 },
    ])
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('no_eligible_lines')
  })
})

describe('MarketingService.redeemCoupon', () => {
  it('increments usesCount atomically', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const marketing = createMarketingService(db)

    await db.insert(coupons).values({
      tenantId: tenant.id,
      code: 'ONEUSE',
      discountType: 'fixed_amount',
      discountValue: '10',
      maxUses: 1,
    })

    const first = await marketing.redeemCoupon(SYSTEM_CONTEXT, tenant.id, 'ONEUSE')
    expect(first.success).toBe(true)
    expect(first.usesCount).toBe(1)

    const second = await marketing.redeemCoupon(SYSTEM_CONTEXT, tenant.id, 'ONEUSE')
    expect(second.success).toBe(false)
    expect(second.usesCount).toBe(1)
  })

  it('proves no lost updates under concurrent redemption near the maxUses boundary', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const marketing = createMarketingService(db)

    await db.insert(coupons).values({
      tenantId: tenant.id,
      code: 'LIMITED5',
      discountType: 'fixed_amount',
      discountValue: '5',
      maxUses: 5,
    })

    const results = await Promise.all(
      Array.from({ length: 8 }, () => marketing.redeemCoupon(SYSTEM_CONTEXT, tenant.id, 'LIMITED5'))
    )
    const successCount = results.filter((r) => r.success).length
    expect(successCount).toBe(5)
  })
})

describe('MarketingService.activateCoupon / deactivateCoupon', () => {
  it('deactivating a coupon makes it fail validation, activating restores it', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const marketing = createMarketingService(db)

    const [coupon] = await db
      .insert(coupons)
      .values({ tenantId: tenant.id, code: 'TOGGLE', discountType: 'percentage', discountValue: '5' })
      .returning()

    await marketing.deactivateCoupon(SYSTEM_CONTEXT, tenant.id, coupon.id)
    const afterDeactivate = await marketing.validateCoupon(SYSTEM_CONTEXT, tenant.id, 'TOGGLE', [
      { sku: 'SKU-1', quantity: 1, unitPrice: 10 },
    ])
    expect(afterDeactivate.reason).toBe('inactive')

    await marketing.activateCoupon(SYSTEM_CONTEXT, tenant.id, coupon.id)
    const afterActivate = await marketing.validateCoupon(SYSTEM_CONTEXT, tenant.id, 'TOGGLE', [
      { sku: 'SKU-1', quantity: 1, unitPrice: 10 },
    ])
    expect(afterActivate.valid).toBe(true)
  })
})

describe('MarketingService — RBAC', () => {
  it('rejects staff activating a coupon (promotion management is a decision, not routine staff work)', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const marketing = createMarketingService(db)
    const staff = { userId: 'user-1', role: 'staff' as const, branchAccess: { type: 'all' as const } }

    const [coupon] = await db
      .insert(coupons)
      .values({ tenantId: tenant.id, code: 'RBAC1', discountType: 'percentage', discountValue: '5' })
      .returning()

    await expect(marketing.activateCoupon(staff, tenant.id, coupon.id)).rejects.toThrow('role "staff"')
  })

  it('allows staff to validate and redeem a coupon at checkout', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const marketing = createMarketingService(db)
    const staff = { userId: 'user-1', role: 'staff' as const, branchAccess: { type: 'all' as const } }

    await db.insert(coupons).values({ tenantId: tenant.id, code: 'RBAC2', discountType: 'percentage', discountValue: '10' })

    const result = await marketing.validateCoupon(staff, tenant.id, 'RBAC2', [
      { sku: 'SKU-1', quantity: 1, unitPrice: 100 },
    ])
    expect(result.valid).toBe(true)

    const redeemed = await marketing.redeemCoupon(staff, tenant.id, 'RBAC2')
    expect(redeemed.success).toBe(true)
  })
})

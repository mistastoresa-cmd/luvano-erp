import { eq, and, sql } from 'drizzle-orm'
import { coupons } from '@/db/schema'
import type { Db } from '@/db/client'
import { createProductsService } from '@/lib/products/service'
import { assertRoleAudited } from '../authz/service'
import type { CallerContext } from '../authz/types'
import type { MarketingService, CartLine, ValidateCouponResult, RedeemCouponResult } from './types'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const PROMOTION_MANAGEMENT_ROLES = ['owner', 'accountant', 'branch_manager'] as const
const CHECKOUT_ROLES = ['owner', 'accountant', 'branch_manager', 'staff'] as const

export function createMarketingService(db: Db): MarketingService {
  const products = createProductsService(db)

  async function resolveEligibleLines(
    context: CallerContext,
    tenantId: string,
    coupon: { targetProductId: string | null; targetVariantId: string | null },
    cartLines: CartLine[]
  ): Promise<CartLine[]> {
    if (!coupon.targetProductId && !coupon.targetVariantId) return cartLines

    const target = coupon.targetVariantId
      ? ({ type: 'variant', variantId: coupon.targetVariantId } as const)
      : ({ type: 'product', productId: coupon.targetProductId! } as const)
    const eligibleSkus = new Set(await products.resolveSkusForTarget(context, tenantId, target))
    return cartLines.filter((line) => eligibleSkus.has(line.sku))
  }

  return {
    async activateCoupon(context: CallerContext, tenantId: string, couponId: string): Promise<void> {
      assertRoleAudited(db, tenantId, context, [...PROMOTION_MANAGEMENT_ROLES])
      await db
        .update(coupons)
        .set({ isActive: true })
        .where(and(eq(coupons.tenantId, tenantId), eq(coupons.id, couponId)))
    },

    async deactivateCoupon(context: CallerContext, tenantId: string, couponId: string): Promise<void> {
      assertRoleAudited(db, tenantId, context, [...PROMOTION_MANAGEMENT_ROLES])
      await db
        .update(coupons)
        .set({ isActive: false })
        .where(and(eq(coupons.tenantId, tenantId), eq(coupons.id, couponId)))
    },

    async validateCoupon(
      context: CallerContext,
      tenantId: string,
      code: string,
      cartLines: CartLine[]
    ): Promise<ValidateCouponResult> {
      assertRoleAudited(db, tenantId, context, [...CHECKOUT_ROLES])
      const [coupon] = await db
        .select()
        .from(coupons)
        .where(and(eq(coupons.tenantId, tenantId), eq(coupons.code, code)))
        .limit(1)

      if (!coupon) return { valid: false, reason: 'not_found', eligibleLines: [], discountAmount: 0 }
      if (!coupon.isActive) {
        return { valid: false, reason: 'inactive', couponId: coupon.id, eligibleLines: [], discountAmount: 0 }
      }

      const now = new Date()
      if (coupon.startsAt && now < coupon.startsAt) {
        return {
          valid: false,
          reason: 'not_started',
          couponId: coupon.id,
          eligibleLines: [],
          discountAmount: 0,
        }
      }
      if (coupon.expiresAt && now > coupon.expiresAt) {
        return { valid: false, reason: 'expired', couponId: coupon.id, eligibleLines: [], discountAmount: 0 }
      }
      if (coupon.maxUses !== null && coupon.usesCount >= coupon.maxUses) {
        return {
          valid: false,
          reason: 'max_uses_reached',
          couponId: coupon.id,
          eligibleLines: [],
          discountAmount: 0,
        }
      }

      // minOrderAmount is checked against the whole cart, regardless of
      // targeting — a merchant offering "10% off the black size-40 shirt"
      // can still require the overall order to reach a minimum.
      const cartTotal = cartLines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0)
      if (coupon.minOrderAmount !== null && cartTotal < Number(coupon.minOrderAmount)) {
        return {
          valid: false,
          reason: 'min_order_not_met',
          couponId: coupon.id,
          eligibleLines: [],
          discountAmount: 0,
        }
      }

      const eligibleLines = await resolveEligibleLines(context, tenantId, coupon, cartLines)
      if (eligibleLines.length === 0) {
        return {
          valid: false,
          reason: 'no_eligible_lines',
          couponId: coupon.id,
          eligibleLines: [],
          discountAmount: 0,
        }
      }

      const eligibleTotal = eligibleLines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0)
      const discountAmount =
        coupon.discountType === 'percentage'
          ? round2((eligibleTotal * Number(coupon.discountValue)) / 100)
          : round2(Math.min(Number(coupon.discountValue), eligibleTotal))

      return { valid: true, couponId: coupon.id, eligibleLines, discountAmount }
    },

    async redeemCoupon(context: CallerContext, tenantId: string, code: string): Promise<RedeemCouponResult> {
      assertRoleAudited(db, tenantId, context, [...CHECKOUT_ROLES])
      // Atomic guarded increment — same pattern as
      // lib/ledger/balance.ts::applyInventoryDelta: the WHERE clause
      // (is_active AND under max_uses) is evaluated against the current row
      // by Postgres itself inside the UPDATE, so two customers racing for
      // the last use of a limited coupon can't both succeed.
      const [row] = await db
        .update(coupons)
        .set({ usesCount: sql`${coupons.usesCount} + 1` })
        .where(
          and(
            eq(coupons.tenantId, tenantId),
            eq(coupons.code, code),
            eq(coupons.isActive, true),
            sql`(${coupons.maxUses} IS NULL OR ${coupons.usesCount} < ${coupons.maxUses})`
          )
        )
        .returning({ usesCount: coupons.usesCount })

      if (!row) {
        const [existing] = await db
          .select({ usesCount: coupons.usesCount })
          .from(coupons)
          .where(and(eq(coupons.tenantId, tenantId), eq(coupons.code, code)))
          .limit(1)
        return { success: false, usesCount: existing?.usesCount ?? 0 }
      }

      return { success: true, usesCount: row.usesCount }
    },
  }
}

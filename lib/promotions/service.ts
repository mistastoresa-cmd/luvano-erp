import { eq, and } from 'drizzle-orm'
import { promotions } from '@/db/schema'
import type { Db } from '@/db/client'
import { assertRoleAudited } from '../authz/service'
import type { CallerContext } from '../authz/types'
import type {
  PromotionsService,
  ApplyPromotionsInput,
  ApplyPromotionsResult,
  AppliedPromotion,
  CartLine,
  ProductDiscountConfig,
  FixedPriceConfig,
  QuantityTiersConfig,
  BuyXGetYConfig,
  LoyaltyTierConfig,
  BankOfferConfig,
  CashbackConfig,
} from './types'

// Evaluating offers happens at checkout, so every role that can ring up a
// sale can evaluate them — same reasoning as lib/marketing's CHECKOUT_ROLES.
const CHECKOUT_ROLES = ['owner', 'accountant', 'branch_manager', 'staff'] as const

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// A promotion with no target applies to the whole cart; otherwise only to
// lines matching its product/variant.
function matchingLines(
  lines: CartLine[],
  targetProductId: string | null,
  targetVariantId: string | null
): CartLine[] {
  if (!targetProductId && !targetVariantId) return lines
  return lines.filter(
    (l) =>
      (targetVariantId && l.variantId === targetVariantId) ||
      (targetProductId && l.productId === targetProductId)
  )
}

function discountForProductDiscount(cfg: ProductDiscountConfig, lines: CartLine[]): number {
  let total = 0
  for (const l of lines) {
    const lineTotal = l.unitPrice * l.quantity
    total +=
      cfg.discountType === 'percentage'
        ? lineTotal * (cfg.value / 100)
        : Math.min(cfg.value, lineTotal)
  }
  return total
}

function discountForFixedPrice(cfg: FixedPriceConfig, lines: CartLine[]): number {
  let total = 0
  for (const l of lines) {
    // Only kicks in once the customer buys the required quantity; then every
    // unit in that line drops to the special price.
    if (l.quantity >= cfg.minQty && l.unitPrice > cfg.specialPrice) {
      total += (l.unitPrice - cfg.specialPrice) * l.quantity
    }
  }
  return total
}

function discountForQuantityTiers(cfg: QuantityTiersConfig, lines: CartLine[]): number {
  let total = 0
  for (const l of lines) {
    // Highest tier the line qualifies for wins (tiers are "buy more, save more").
    const tier = [...(cfg.tiers ?? [])]
      .filter((t) => l.quantity >= t.minQty)
      .sort((a, b) => b.minQty - a.minQty)[0]
    if (tier) total += l.unitPrice * l.quantity * (tier.discountPct / 100)
  }
  return total
}

function discountForBuyXGetY(cfg: BuyXGetYConfig, lines: CartLine[]): number {
  const groupSize = cfg.buyQty + cfg.getQty
  if (groupSize <= 0) return 0
  let total = 0
  for (const l of lines) {
    // Each complete "buy X + get Y" group yields getQty discounted units.
    const groups = Math.floor(l.quantity / groupSize)
    const freeUnits = groups * cfg.getQty
    total += freeUnits * l.unitPrice * (cfg.getDiscountPct / 100)
  }
  return total
}

function discountForLoyaltyTier(
  cfg: LoyaltyTierConfig,
  lines: CartLine[],
  customerTier: string | undefined
): number {
  if (!customerTier || customerTier !== cfg.tier) return 0
  return lines.reduce((sum, l) => sum + l.unitPrice * l.quantity * (cfg.discountPct / 100), 0)
}

function linesTotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
}

function discountForBankOffer(
  cfg: BankOfferConfig,
  lines: CartLine[],
  bankName: string | undefined
): number {
  if (!bankName || bankName !== cfg.bankName) return 0
  const total = linesTotal(lines)
  if (cfg.minOrderAmount != null && total < cfg.minOrderAmount) return 0
  return total * (cfg.discountPct / 100)
}

// Cashback is credited, not discounted — returned separately from the
// invoice discount so totals aren't reduced twice.
function cashbackFor(cfg: CashbackConfig, lines: CartLine[]): number {
  const raw = linesTotal(lines) * (cfg.cashbackPct / 100)
  return cfg.maxCashback != null ? Math.min(raw, cfg.maxCashback) : raw
}

export function createPromotionsService(db: Db): PromotionsService {
  return {
    async applyPromotions(
      context: CallerContext,
      tenantId: string,
      input: ApplyPromotionsInput
    ): Promise<ApplyPromotionsResult> {
      assertRoleAudited(db, tenantId, context, [...CHECKOUT_ROLES])

      const at = input.at ?? new Date()
      const rows = await db
        .select()
        .from(promotions)
        .where(and(eq(promotions.tenantId, tenantId), eq(promotions.isActive, true)))

      const applied: AppliedPromotion[] = []
      let totalCashback = 0

      for (const p of rows) {
        // Date window — a promotion with no start/end runs indefinitely.
        if (p.startsAt && at < p.startsAt) continue
        if (p.expiresAt && at > p.expiresAt) continue

        const lines = matchingLines(input.lines, p.targetProductId, p.targetVariantId)
        if (lines.length === 0) continue

        const cfg = (p.config ?? {}) as Record<string, unknown>

        // Cashback is credited, not discounted — handled before the discount
        // switch so it never reduces the invoice total.
        if (p.offerType === 'cashback') {
          const amount = round2(cashbackFor(cfg as unknown as CashbackConfig, lines))
          if (amount > 0) {
            totalCashback += amount
            applied.push({
              promotionId: p.id,
              name: p.name,
              offerType: p.offerType,
              discountAmount: 0,
              affectedSkus: lines.map((l) => l.sku),
            })
          }
          continue
        }

        let discount = 0
        switch (p.offerType) {
          case 'product_discount':
            discount = discountForProductDiscount(cfg as unknown as ProductDiscountConfig, lines)
            break
          case 'fixed_price':
            discount = discountForFixedPrice(cfg as unknown as FixedPriceConfig, lines)
            break
          case 'quantity_tiers':
            discount = discountForQuantityTiers(cfg as unknown as QuantityTiersConfig, lines)
            break
          case 'buy_x_get_y':
            discount = discountForBuyXGetY(cfg as unknown as BuyXGetYConfig, lines)
            break
          case 'loyalty_tier':
            discount = discountForLoyaltyTier(
              cfg as unknown as LoyaltyTierConfig,
              lines,
              input.customerTier
            )
            break
          case 'bank_offer':
            discount = discountForBankOffer(
              cfg as unknown as BankOfferConfig,
              lines,
              input.bankName
            )
            break
        }

        discount = round2(discount)
        if (discount <= 0) continue

        applied.push({
          promotionId: p.id,
          name: p.name,
          offerType: p.offerType,
          discountAmount: discount,
          affectedSkus: lines.map((l) => l.sku),
        })
      }

      return {
        appliedPromotions: applied,
        totalDiscount: round2(applied.reduce((s, a) => s + a.discountAmount, 0)),
        totalCashback: round2(totalCashback),
      }
    },
  }
}

import type { CallerContext } from '../authz/types'

export type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'diamond'

// Per-offer-type config shapes stored in promotions.config (jsonb).
// See db/schema/promotions.ts for the authoritative comment.
export interface ProductDiscountConfig {
  discountType: 'percentage' | 'fixed'
  value: number
}
export interface FixedPriceConfig {
  minQty: number
  specialPrice: number
}
export interface QuantityTiersConfig {
  tiers: { minQty: number; discountPct: number }[]
}
export interface BuyXGetYConfig {
  buyQty: number
  getQty: number
  // 100 = the "get" item is free; 50 = half price, etc.
  getDiscountPct: number
}
export interface LoyaltyTierConfig {
  tier: LoyaltyTier
  discountPct: number
}
export interface BankOfferConfig {
  bankName: string
  discountPct: number
  minOrderAmount?: number
}
export interface CashbackConfig {
  cashbackPct: number
  // Optional ceiling on the cashback credited per order.
  maxCashback?: number
}

// A single line the customer is buying, as the checkout passes it in.
export interface CartLine {
  sku: string
  productId?: string
  variantId?: string
  // The line's product category — used by category-targeted promotions.
  category?: string
  quantity: number
  unitPrice: number
}

export interface AppliedPromotion {
  promotionId: string
  name: string
  offerType: string
  // Total discount (SAR) this promotion contributes across the cart.
  discountAmount: number
  affectedSkus: string[]
}

export interface ApplyPromotionsInput {
  lines: CartLine[]
  // Needed only by loyalty_tier offers; omit for anonymous/walk-in sales.
  customerTier?: LoyaltyTier
  // Needed only by bank_offer offers — the paying card's bank.
  bankName?: string
  // Defaults to now — lets callers evaluate a cart against a past/future date.
  at?: Date
}

export interface ApplyPromotionsResult {
  appliedPromotions: AppliedPromotion[]
  // Immediate discount taken off the invoice.
  totalDiscount: number
  // Credited back to the customer's wallet instead of discounting the
  // invoice — kept separate so invoice totals stay untouched by cashback.
  totalCashback: number
}

export interface PromotionsService {
  applyPromotions(
    context: CallerContext,
    tenantId: string,
    input: ApplyPromotionsInput
  ): Promise<ApplyPromotionsResult>
}

export interface CartLine {
  sku: string
  quantity: number
  unitPrice: number
}

export interface ValidateCouponResult {
  valid: boolean
  // Present only when valid is false — why redemption would be rejected.
  reason?:
    | 'not_found'
    | 'inactive'
    | 'not_started'
    | 'expired'
    | 'max_uses_reached'
    | 'min_order_not_met'
    | 'no_eligible_lines'
  couponId?: string
  // Cart lines the coupon actually applies to — every line when the coupon
  // is untargeted, only the matching SKU(s) when it's targeted to a
  // product or a specific variant. discountAmount is computed from these,
  // not the full cart.
  eligibleLines: CartLine[]
  discountAmount: number
}

export interface RedeemCouponResult {
  success: boolean
  usesCount: number
}

export interface MarketingService {
  activateCoupon(tenantId: string, couponId: string): Promise<void>
  deactivateCoupon(tenantId: string, couponId: string): Promise<void>

  // Read-only — computes what the coupon would do against this cart without
  // consuming a use. Call this before checkout; call redeemCoupon only once
  // the order is actually placed.
  validateCoupon(tenantId: string, code: string, cartLines: CartLine[]): Promise<ValidateCouponResult>

  // Atomically increments usesCount, guarded against exceeding maxUses under
  // concurrent redemptions (two customers racing for the last use of a
  // limited coupon) — same "atomic relative update" pattern as
  // lib/ledger/balance.ts::applyInventoryDelta, not a read-then-write check.
  redeemCoupon(tenantId: string, code: string): Promise<RedeemCouponResult>
}

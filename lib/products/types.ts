import type { CallerContext } from '../authz/types'

export interface CreateProductVariantInput {
  sku: string
  barcode?: string
  costPrice?: number
  sellPrice?: number
  taxable?: boolean
  reorderLevel?: number
  attributes?: Record<string, string>
}

export interface CreateProductInput {
  tenantId: string
  name: string
  nameEn?: string
  category?: string
  brand?: string
  unit?: string
  description?: string
  imageUrl?: string
  // At least one — a simple product passes a single variant with no
  // attributes (e.g. [{ sku: 'PERFUME-100ML' }]); a clothing/shoes product
  // passes one per color/size combination.
  variants: CreateProductVariantInput[]
}

export interface CreateProductResult {
  productId: string
  variantIds: string[]
}

// What a report or an offer (coupon/campaign) is scoped to — resolved down
// to the actual SKU list by resolveSkusForTarget. This is the founder's
// exact requirement: target the parent (covers every child) or one specific
// child (e.g. "discount only on size 40, black").
export type ProductTarget = { type: 'product'; productId: string } | { type: 'variant'; variantId: string }

export interface ProductsService {
  // Catalog management — a decision-level action (owner/accountant/
  // branch_manager), not routine staff work (RBAC extension beyond the
  // original 5-service T7 scope — see docs/ARCHITECTURE.md).
  createProduct(context: CallerContext, input: CreateProductInput): Promise<CreateProductResult>
  addVariant(
    context: CallerContext,
    tenantId: string,
    productId: string,
    variant: CreateProductVariantInput
  ): Promise<string>
  // Read-only SKU lookup — open to all 4 roles, since lib/marketing calls
  // this internally on behalf of whatever caller (including POS staff at
  // checkout) is validating/redeeming a coupon.
  resolveSkusForTarget(context: CallerContext, tenantId: string, target: ProductTarget): Promise<string[]>
}

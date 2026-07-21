export interface CreateProductVariantInput {
  sku: string
  attributes?: Record<string, string>
}

export interface CreateProductInput {
  tenantId: string
  name: string
  category?: string
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
  createProduct(input: CreateProductInput): Promise<CreateProductResult>
  addVariant(tenantId: string, productId: string, variant: CreateProductVariantInput): Promise<string>
  resolveSkusForTarget(tenantId: string, target: ProductTarget): Promise<string[]>
}

import { eq, and } from 'drizzle-orm'
import { products, productVariants } from '@/db/schema'
import type { Db } from '@/db/client'
import { assertRoleAudited } from '../authz/service'
import type { CallerContext } from '../authz/types'
import type {
  ProductsService,
  CreateProductInput,
  CreateProductResult,
  CreateProductVariantInput,
  ProductTarget,
} from './types'

const CATALOG_ROLES = ['owner', 'accountant', 'branch_manager'] as const
const CATALOG_READ_ROLES = ['owner', 'accountant', 'branch_manager', 'staff'] as const

export function createProductsService(db: Db): ProductsService {
  return {
    async createProduct(context: CallerContext, input: CreateProductInput): Promise<CreateProductResult> {
      assertRoleAudited(db, input.tenantId, context, [...CATALOG_ROLES])
      if (input.variants.length === 0) {
        throw new Error('createProduct requires at least one variant (a simple product has exactly one)')
      }

      return db.transaction(async (tx) => {
        const [product] = await tx
          .insert(products)
          .values({ tenantId: input.tenantId, name: input.name, category: input.category })
          .returning({ id: products.id })

        const variantRows = await tx
          .insert(productVariants)
          .values(
            input.variants.map((v) => ({
              tenantId: input.tenantId,
              productId: product.id,
              sku: v.sku,
              attributes: v.attributes ?? {},
            }))
          )
          .returning({ id: productVariants.id })

        return { productId: product.id, variantIds: variantRows.map((r) => r.id) }
      })
    },

    async addVariant(
      context: CallerContext,
      tenantId: string,
      productId: string,
      variant: CreateProductVariantInput
    ): Promise<string> {
      assertRoleAudited(db, tenantId, context, [...CATALOG_ROLES])
      const [row] = await db
        .insert(productVariants)
        .values({
          tenantId,
          productId,
          sku: variant.sku,
          attributes: variant.attributes ?? {},
        })
        .returning({ id: productVariants.id })
      return row.id
    },

    async resolveSkusForTarget(
      context: CallerContext,
      tenantId: string,
      target: ProductTarget
    ): Promise<string[]> {
      assertRoleAudited(db, tenantId, context, [...CATALOG_READ_ROLES])
      if (target.type === 'variant') {
        const [row] = await db
          .select({ sku: productVariants.sku })
          .from(productVariants)
          .where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.id, target.variantId)))
          .limit(1)
        return row ? [row.sku] : []
      }

      const rows = await db
        .select({ sku: productVariants.sku })
        .from(productVariants)
        .where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.productId, target.productId)))
      return rows.map((r) => r.sku)
    },
  }
}

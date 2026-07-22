import { describe, it, expect } from 'vitest'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { createProductsService } from '@/lib/products/service'
import { SYSTEM_CONTEXT } from '@/lib/authz/types'

describe('ProductsService.createProduct', () => {
  it('creates a simple (non-variant) product with exactly one variant', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const products = createProductsService(db)

    const result = await products.createProduct(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      name: 'Oud 100ml',
      variants: [{ sku: 'OUD-100ML' }],
    })

    expect(result.variantIds).toHaveLength(1)
  })

  it('creates a variant product with one row per color/size combination', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const products = createProductsService(db)

    const result = await products.createProduct(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      name: 'Classic Shirt',
      category: 'clothing',
      variants: [
        { sku: 'SHIRT-BLK-40', attributes: { color: 'black', size: '40' } },
        { sku: 'SHIRT-BLK-42', attributes: { color: 'black', size: '42' } },
        { sku: 'SHIRT-WHT-40', attributes: { color: 'white', size: '40' } },
      ],
    })

    expect(result.variantIds).toHaveLength(3)
  })

  it('rejects a product with zero variants', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const products = createProductsService(db)

    await expect(
      products.createProduct(SYSTEM_CONTEXT, { tenantId: tenant.id, name: 'Empty Product', variants: [] })
    ).rejects.toThrow(/at least one variant/)
  })

  it('enforces unique sku per tenant', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const products = createProductsService(db)

    await products.createProduct(SYSTEM_CONTEXT, { tenantId: tenant.id, name: 'Product A', variants: [{ sku: 'DUP-SKU' }] })

    await expect(
      products.createProduct(SYSTEM_CONTEXT, { tenantId: tenant.id, name: 'Product B', variants: [{ sku: 'DUP-SKU' }] })
    ).rejects.toThrow()
  })
})

describe('ProductsService.addVariant', () => {
  it('adds a new variant to an existing product', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const products = createProductsService(db)

    const { productId } = await products.createProduct(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      name: 'Sneakers',
      variants: [{ sku: 'SNEAK-BLK-42', attributes: { color: 'black', size: '42' } }],
    })

    const variantId = await products.addVariant(SYSTEM_CONTEXT, tenant.id, productId, {
      sku: 'SNEAK-BLK-43',
      attributes: { color: 'black', size: '43' },
    })

    expect(variantId).toBeTruthy()
    const skus = await products.resolveSkusForTarget(SYSTEM_CONTEXT, tenant.id, { type: 'product', productId })
    expect(skus).toEqual(expect.arrayContaining(['SNEAK-BLK-42', 'SNEAK-BLK-43']))
  })
})

describe('ProductsService.resolveSkusForTarget', () => {
  it('resolves a product target to every child SKU (the "discount on the whole parent" case)', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const products = createProductsService(db)

    const { productId } = await products.createProduct(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      name: 'Classic Shirt',
      variants: [
        { sku: 'SHIRT-BLK-40', attributes: { color: 'black', size: '40' } },
        { sku: 'SHIRT-BLK-42', attributes: { color: 'black', size: '42' } },
      ],
    })

    const skus = await products.resolveSkusForTarget(SYSTEM_CONTEXT, tenant.id, { type: 'product', productId })
    expect(skus.sort()).toEqual(['SHIRT-BLK-40', 'SHIRT-BLK-42'])
  })

  it('resolves a variant target to exactly one SKU (the "size 40 black only" case)', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const products = createProductsService(db)

    const { variantIds } = await products.createProduct(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      name: 'Classic Shirt',
      variants: [
        { sku: 'SHIRT-BLK-40', attributes: { color: 'black', size: '40' } },
        { sku: 'SHIRT-BLK-42', attributes: { color: 'black', size: '42' } },
      ],
    })

    const skus = await products.resolveSkusForTarget(SYSTEM_CONTEXT, tenant.id, {
      type: 'variant',
      variantId: variantIds[0],
    })
    expect(skus).toEqual(['SHIRT-BLK-40'])
  })

  it('returns an empty array for a variant id that does not exist', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const products = createProductsService(db)

    const skus = await products.resolveSkusForTarget(SYSTEM_CONTEXT, tenant.id, {
      type: 'variant',
      variantId: '00000000-0000-0000-0000-000000000000',
    })
    expect(skus).toEqual([])
  })
})

describe('ProductsService — RBAC', () => {
  it('rejects staff creating a product (catalog management is a decision, not routine staff work)', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const products = createProductsService(db)
    const staff = { userId: 'user-1', role: 'staff' as const, branchAccess: { type: 'all' as const } }

    await expect(
      products.createProduct(staff, { tenantId: tenant.id, name: 'Staff Product', variants: [{ sku: 'SKU-X' }] })
    ).rejects.toThrow('role "staff"')
  })

  it('allows staff to resolve SKUs (read-only, used by marketing at checkout)', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const products = createProductsService(db)
    const staff = { userId: 'user-1', role: 'staff' as const, branchAccess: { type: 'all' as const } }

    const { productId } = await products.createProduct(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      name: 'Product A',
      variants: [{ sku: 'SKU-Y' }],
    })
    const skus = await products.resolveSkusForTarget(staff, tenant.id, { type: 'product', productId })
    expect(skus).toEqual(['SKU-Y'])
  })
})

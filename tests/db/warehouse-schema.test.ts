import { describe, it, expect } from 'vitest'
import { createTestDb } from '../setup/db'
import { branches, stockTransfers, stockTransferLines, tenants } from '@/db/schema'

describe('central-warehouse model', () => {
  it('allows one default warehouse per tenant and rejects a second', async () => {
    const db = await createTestDb()
    const [tenant] = await db.insert(tenants).values({ name: 'Test Tenant' }).returning()

    await db.insert(branches).values({
      tenantId: tenant.id,
      name: 'Main Warehouse',
      code: 'WH-01',
      type: 'warehouse',
      isDefaultWarehouse: true,
    })

    await expect(
      db.insert(branches).values({
        tenantId: tenant.id,
        name: 'Second Warehouse',
        code: 'WH-02',
        type: 'warehouse',
        isDefaultWarehouse: true,
      })
    ).rejects.toThrow()

    // A second non-default warehouse for the same tenant is fine — only the
    // "default" flag is constrained to one per tenant, not the warehouse type.
    await db.insert(branches).values({
      tenantId: tenant.id,
      name: 'Overflow Warehouse',
      code: 'WH-02',
      type: 'warehouse',
      isDefaultWarehouse: false,
    })
  })

  it('records a stock transfer from the warehouse to a branch', async () => {
    const db = await createTestDb()
    const [tenant] = await db.insert(tenants).values({ name: 'Test Tenant' }).returning()

    const [warehouse] = await db
      .insert(branches)
      .values({
        tenantId: tenant.id,
        name: 'Main Warehouse',
        code: 'WH-01',
        type: 'warehouse',
        isDefaultWarehouse: true,
      })
      .returning()
    const [branch] = await db
      .insert(branches)
      .values({ tenantId: tenant.id, name: 'Riyadh Branch', code: 'RIYADH-01', type: 'physical' })
      .returning()

    const [transfer] = await db
      .insert(stockTransfers)
      .values({
        tenantId: tenant.id,
        fromBranchId: warehouse.id,
        toBranchId: branch.id,
        transferNumber: 'TR-0001',
        transferDate: '2026-07-20',
      })
      .returning()

    const [line] = await db
      .insert(stockTransferLines)
      .values({ transferId: transfer.id, sku: 'SKU-1', quantity: 10 })
      .returning()

    expect(line.fromMovementId).toBeNull()
    expect(line.toMovementId).toBeNull()
    expect(transfer.status).toBe('draft')
  })
})

import { describe, it, expect } from 'vitest'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { applyInventoryDeltaWithCost, readInventoryCost } from '@/lib/ledger/balance'

describe('applyInventoryDeltaWithCost', () => {
  it('sets the initial average cost from the first cost-bearing receipt', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)

    const result = await applyInventoryDeltaWithCost(db, tenant.id, physicalBranch.id, 'SKU-1', 10, 20)
    expect(result.resultingQuantity).toBe(10)
    expect(result.averageCost).toBe(20)

    const cost = await readInventoryCost(db, tenant.id, physicalBranch.id, 'SKU-1')
    expect(cost).toBe(20)
  })

  it('blends the weighted average across two receipts at different costs', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)

    // 10 units @ 20 = 200
    await applyInventoryDeltaWithCost(db, tenant.id, physicalBranch.id, 'SKU-1', 10, 20)
    // + 10 units @ 30 = 300 → 500 / 20 = 25
    const second = await applyInventoryDeltaWithCost(db, tenant.id, physicalBranch.id, 'SKU-1', 10, 30)

    expect(second.resultingQuantity).toBe(20)
    expect(second.averageCost).toBe(25)
  })

  it('leaves average cost unchanged on a decrease (sale/transfer-out)', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)

    await applyInventoryDeltaWithCost(db, tenant.id, physicalBranch.id, 'SKU-1', 10, 20)
    // A decrease with no unitCost — same call shape a sale would use.
    const afterSale = await applyInventoryDeltaWithCost(db, tenant.id, physicalBranch.id, 'SKU-1', -3)

    expect(afterSale.resultingQuantity).toBe(7)
    expect(afterSale.averageCost).toBe(20)
  })

  it('resets to the new unit cost instead of blending when quantity is at or below zero', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)

    // No prior stock (quantity starts at 0) — first receipt establishes cost.
    const result = await applyInventoryDeltaWithCost(db, tenant.id, physicalBranch.id, 'SKU-2', 5, 40)
    expect(result.averageCost).toBe(40)

    // Oversell to negative, then receive again — blending against a negative
    // base isn't meaningful, so the new cost should just replace it.
    await applyInventoryDeltaWithCost(db, tenant.id, physicalBranch.id, 'SKU-2', -8)
    const afterReceiveIntoNegative = await applyInventoryDeltaWithCost(
      db,
      tenant.id,
      physicalBranch.id,
      'SKU-2',
      3,
      50
    )
    expect(afterReceiveIntoNegative.averageCost).toBe(50)
  })
})

import { describe, it, expect } from 'vitest'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { applyInventoryDelta, readInventoryBalance } from '@/lib/ledger/balance'

describe('applyInventoryDelta', () => {
  it('creates a balance row on first write and accumulates on repeated writes', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)

    const first = await applyInventoryDelta(db, tenant.id, physicalBranch.id, 'SKU-1', 10)
    expect(first.resultingQuantity).toBe(10)
    expect(first.oversold).toBe(false)

    const second = await applyInventoryDelta(db, tenant.id, physicalBranch.id, 'SKU-1', -3)
    expect(second.resultingQuantity).toBe(7)

    const balance = await readInventoryBalance(db, tenant.id, physicalBranch.id, 'SKU-1')
    expect(balance).toBe(7)
  })

  it('flags oversold without throwing when quantity goes negative', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)

    const result = await applyInventoryDelta(db, tenant.id, physicalBranch.id, 'SKU-2', -5)
    expect(result.resultingQuantity).toBe(-5)
    expect(result.oversold).toBe(true)
  })

  it('proves no lost update under concurrent writers to the same SKU', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)

    // Simulates a Salla webhook and a branch POS sale hitting the same SKU at
    // the same instant — both deltas must be reflected, none lost.
    await Promise.all([
      applyInventoryDelta(db, tenant.id, physicalBranch.id, 'SKU-3', 100),
      applyInventoryDelta(db, tenant.id, physicalBranch.id, 'SKU-3', -1),
      applyInventoryDelta(db, tenant.id, physicalBranch.id, 'SKU-3', -1),
      applyInventoryDelta(db, tenant.id, physicalBranch.id, 'SKU-3', -1),
    ])

    const balance = await readInventoryBalance(db, tenant.id, physicalBranch.id, 'SKU-3')
    expect(balance).toBe(97)
  })
})

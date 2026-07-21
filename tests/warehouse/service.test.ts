import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { createWarehouseService } from '@/lib/warehouse/service'
import { branches, stockTransfers, stockTransferLines, reconciliationAlerts } from '@/db/schema'
import { readInventoryBalance, applyInventoryDelta } from '@/lib/ledger/balance'

describe('WarehouseService.postStockTransfer', () => {
  it('moves stock from the warehouse to a branch, linking both movement ids', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
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

    await applyInventoryDelta(db, tenant.id, warehouse.id, 'SKU-1', 50)

    const [transfer] = await db
      .insert(stockTransfers)
      .values({
        tenantId: tenant.id,
        fromBranchId: warehouse.id,
        toBranchId: physicalBranch.id,
        transferNumber: 'TR-TEST-1',
        transferDate: '2026-07-20',
      })
      .returning()
    const [line] = await db
      .insert(stockTransferLines)
      .values({ transferId: transfer.id, sku: 'SKU-1', quantity: 10 })
      .returning()

    const service = createWarehouseService(db)
    const result = await service.postStockTransfer(tenant.id, transfer.id)

    expect(result.lines[0].status).toBe('accepted')
    expect(result.lines[0].fromResultingQuantity).toBe(40)
    expect(result.lines[0].toResultingQuantity).toBe(10)

    const warehouseBalance = await readInventoryBalance(db, tenant.id, warehouse.id, 'SKU-1')
    const branchBalance = await readInventoryBalance(db, tenant.id, physicalBranch.id, 'SKU-1')
    expect(warehouseBalance).toBe(40)
    expect(branchBalance).toBe(10)

    const [updatedLine] = await db
      .select()
      .from(stockTransferLines)
      .where(eq(stockTransferLines.id, line.id))
    expect(updatedLine.fromMovementId).toBe(result.lines[0].fromMovementId)
    expect(updatedLine.toMovementId).toBe(result.lines[0].toMovementId)

    const [updatedTransfer] = await db
      .select()
      .from(stockTransfers)
      .where(eq(stockTransfers.id, transfer.id))
    expect(updatedTransfer.status).toBe('completed')
  })

  it('records an oversell alert instead of blocking when the source lacks stock', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    const [warehouse] = await db
      .insert(branches)
      .values({ tenantId: tenant.id, name: 'Main Warehouse', code: 'WH-01', type: 'warehouse' })
      .returning()

    // No stock seeded at the warehouse — transferring out should still be
    // recorded (per docs/design-spikes/01-conflict-resolution.md), not blocked.
    const [transfer] = await db
      .insert(stockTransfers)
      .values({
        tenantId: tenant.id,
        fromBranchId: warehouse.id,
        toBranchId: physicalBranch.id,
        transferNumber: 'TR-TEST-2',
        transferDate: '2026-07-20',
      })
      .returning()
    await db.insert(stockTransferLines).values({ transferId: transfer.id, sku: 'SKU-2', quantity: 5 })

    const service = createWarehouseService(db)
    const result = await service.postStockTransfer(tenant.id, transfer.id)

    expect(result.lines[0].fromOversold).toBe(true)
    expect(result.lines[0].fromResultingQuantity).toBe(-5)

    const alerts = await db
      .select()
      .from(reconciliationAlerts)
      .where(eq(reconciliationAlerts.branchId, warehouse.id))
    expect(alerts).toHaveLength(1)
    expect(alerts[0].type).toBe('oversell')
  })

  it('is idempotent — re-posting does not move stock twice', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    const [warehouse] = await db
      .insert(branches)
      .values({ tenantId: tenant.id, name: 'Main Warehouse', code: 'WH-01', type: 'warehouse' })
      .returning()
    await applyInventoryDelta(db, tenant.id, warehouse.id, 'SKU-1', 20)

    const [transfer] = await db
      .insert(stockTransfers)
      .values({
        tenantId: tenant.id,
        fromBranchId: warehouse.id,
        toBranchId: physicalBranch.id,
        transferNumber: 'TR-TEST-3',
        transferDate: '2026-07-20',
      })
      .returning()
    await db.insert(stockTransferLines).values({ transferId: transfer.id, sku: 'SKU-1', quantity: 5 })

    const service = createWarehouseService(db)
    await service.postStockTransfer(tenant.id, transfer.id)
    const second = await service.postStockTransfer(tenant.id, transfer.id)

    expect(second.lines[0].status).toBe('duplicate')
    const warehouseBalance = await readInventoryBalance(db, tenant.id, warehouse.id, 'SKU-1')
    const branchBalance = await readInventoryBalance(db, tenant.id, physicalBranch.id, 'SKU-1')
    expect(warehouseBalance).toBe(15)
    expect(branchBalance).toBe(5)
  })
})

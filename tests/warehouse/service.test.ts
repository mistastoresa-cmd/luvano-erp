import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { createWarehouseService } from '@/lib/warehouse/service'
import { SYSTEM_CONTEXT } from '@/lib/authz/types'
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
    const result = await service.postStockTransfer(SYSTEM_CONTEXT, tenant.id, transfer.id)

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
    const result = await service.postStockTransfer(SYSTEM_CONTEXT, tenant.id, transfer.id)

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
    await service.postStockTransfer(SYSTEM_CONTEXT, tenant.id, transfer.id)
    const second = await service.postStockTransfer(SYSTEM_CONTEXT, tenant.id, transfer.id)

    expect(second.lines[0].status).toBe('duplicate')
    const warehouseBalance = await readInventoryBalance(db, tenant.id, warehouse.id, 'SKU-1')
    const branchBalance = await readInventoryBalance(db, tenant.id, physicalBranch.id, 'SKU-1')
    expect(warehouseBalance).toBe(15)
    expect(branchBalance).toBe(5)
  })
})

describe('WarehouseService — RBAC', () => {
  it('requires branch access to both the source and destination branch', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    const [warehouse] = await db
      .insert(branches)
      .values({
        tenantId: tenant.id,
        name: 'Main Warehouse',
        code: 'WH-RBAC-1',
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
        transferNumber: 'TR-RBAC-1',
        transferDate: '2026-07-20',
      })
      .returning()
    await db.insert(stockTransferLines).values({ transferId: transfer.id, sku: 'SKU-1', quantity: 10 })

    const service = createWarehouseService(db)
    // Access to the destination branch only — not the source warehouse.
    const restricted = {
      userId: 'user-1',
      role: 'branch_manager' as const,
      branchAccess: { type: 'list' as const, branchIds: [physicalBranch.id] },
    }

    await expect(service.postStockTransfer(restricted, tenant.id, transfer.id)).rejects.toThrow(
      'no access to branch'
    )
  })
})

describe('WarehouseService — two-phase transfer with approval', () => {
  async function setup() {
    const db = await createTestDb()
    const { tenant, physicalBranch, onlineBranch } = await seedTenantWithBranch(db)
    // Give the source branch stock at a known cost.
    const { applyInventoryDeltaWithCost } = await import('@/lib/ledger/balance')
    await applyInventoryDeltaWithCost(db, tenant.id, physicalBranch.id, 'SKU-1', 50, 20)
    const [transfer] = await db
      .insert(stockTransfers)
      .values({
        tenantId: tenant.id,
        fromBranchId: physicalBranch.id,
        toBranchId: onlineBranch.id,
        transferNumber: 'TR-2P-1',
        transferDate: '2026-07-20',
      })
      .returning()
    await db
      .insert(stockTransferLines)
      .values({ transferId: transfer.id, sku: 'SKU-1', quantity: 10 })
    return { db, tenant, from: physicalBranch, to: onlineBranch, transfer }
  }

  it('ships out on initiate (in_transit) then lands on approve (completed)', async () => {
    const { db, tenant, from, to, transfer } = await setup()
    const svc = createWarehouseService(db)

    await svc.initiateStockTransfer(SYSTEM_CONTEXT, tenant.id, transfer.id)

    // Stock left the source; receiver hasn't got it yet.
    expect(await readInventoryBalance(db, tenant.id, from.id, 'SKU-1')).toBe(40)
    expect(await readInventoryBalance(db, tenant.id, to.id, 'SKU-1')).toBe(0)
    const [afterInit] = await db
      .select({ status: stockTransfers.status })
      .from(stockTransfers)
      .where(eq(stockTransfers.id, transfer.id))
    expect(afterInit.status).toBe('in_transit')

    await svc.approveStockTransfer(SYSTEM_CONTEXT, tenant.id, transfer.id)

    // Now the receiver has it, at the source's carried cost.
    expect(await readInventoryBalance(db, tenant.id, to.id, 'SKU-1')).toBe(10)
    const [afterApprove] = await db
      .select({ status: stockTransfers.status })
      .from(stockTransfers)
      .where(eq(stockTransfers.id, transfer.id))
    expect(afterApprove.status).toBe('completed')
  })

  it('returns stock to the source when an in-transit transfer is cancelled', async () => {
    const { db, tenant, from, to, transfer } = await setup()
    const svc = createWarehouseService(db)

    await svc.initiateStockTransfer(SYSTEM_CONTEXT, tenant.id, transfer.id)
    expect(await readInventoryBalance(db, tenant.id, from.id, 'SKU-1')).toBe(40)

    await svc.cancelStockTransfer(SYSTEM_CONTEXT, tenant.id, transfer.id)

    // Stock is back with the sender; receiver never got any.
    expect(await readInventoryBalance(db, tenant.id, from.id, 'SKU-1')).toBe(50)
    expect(await readInventoryBalance(db, tenant.id, to.id, 'SKU-1')).toBe(0)
    const [row] = await db
      .select({ status: stockTransfers.status })
      .from(stockTransfers)
      .where(eq(stockTransfers.id, transfer.id))
    expect(row.status).toBe('cancelled')
  })

  it('rejects approving a transfer that is not in transit', async () => {
    const { db, tenant, transfer } = await setup()
    const svc = createWarehouseService(db)
    await expect(
      svc.approveStockTransfer(SYSTEM_CONTEXT, tenant.id, transfer.id)
    ).rejects.toThrow(/in_transit/)
  })

  it('only the receiving branch can approve', async () => {
    const { db, tenant, from, transfer } = await setup()
    const svc = createWarehouseService(db)
    await svc.initiateStockTransfer(SYSTEM_CONTEXT, tenant.id, transfer.id)

    // A manager restricted to the SOURCE branch cannot approve the receipt.
    const sourceOnly = {
      userId: 'u-src',
      role: 'branch_manager' as const,
      branchAccess: { type: 'list' as const, branchIds: [from.id] },
    }
    await expect(svc.approveStockTransfer(sourceOnly, tenant.id, transfer.id)).rejects.toThrow(
      'no access to branch'
    )
  })
})

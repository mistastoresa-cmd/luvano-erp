import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { createPurchasingService } from '@/lib/purchasing/service'
import { suppliers, goodsReceipts, goodsReceiptLines } from '@/db/schema'
import { readInventoryBalance } from '@/lib/ledger/balance'

async function seedReceipt(db: Awaited<ReturnType<typeof createTestDb>>, tenantId: string, branchId: string) {
  const [supplier] = await db.insert(suppliers).values({ tenantId, name: 'Test Supplier' }).returning()
  const [receipt] = await db
    .insert(goodsReceipts)
    .values({ tenantId, branchId, receiptNumber: 'GR-TEST-1', receivedDate: '2026-07-20' })
    .returning()
  const [line] = await db
    .insert(goodsReceiptLines)
    .values({ goodsReceiptId: receipt.id, sku: 'SKU-1', quantityReceived: 15, unitCost: '20.00' })
    .returning()
  return { supplier, receipt, line }
}

describe('PurchasingService.postGoodsReceipt', () => {
  it('increases inventory, links the movement id, and marks the receipt completed', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    const { receipt, line } = await seedReceipt(db, tenant.id, physicalBranch.id)
    const service = createPurchasingService(db)

    const result = await service.postGoodsReceipt(tenant.id, receipt.id)

    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].status).toBe('accepted')
    expect(result.lines[0].resultingQuantity).toBe(15)

    const balance = await readInventoryBalance(db, tenant.id, physicalBranch.id, 'SKU-1')
    expect(balance).toBe(15)

    const [updatedLine] = await db
      .select()
      .from(goodsReceiptLines)
      .where(eq(goodsReceiptLines.id, line.id))
    expect(updatedLine.inventoryMovementId).toBe(result.lines[0].movementId)

    const [updatedReceipt] = await db
      .select()
      .from(goodsReceipts)
      .where(eq(goodsReceipts.id, receipt.id))
    expect(updatedReceipt.status).toBe('completed')
  })

  it('is idempotent — re-posting the same receipt does not double the inventory', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    const { receipt } = await seedReceipt(db, tenant.id, physicalBranch.id)
    const service = createPurchasingService(db)

    await service.postGoodsReceipt(tenant.id, receipt.id)
    const second = await service.postGoodsReceipt(tenant.id, receipt.id)

    expect(second.lines[0].status).toBe('duplicate')
    const balance = await readInventoryBalance(db, tenant.id, physicalBranch.id, 'SKU-1')
    expect(balance).toBe(15)
  })
})

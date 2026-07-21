import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { createPurchasingService } from '@/lib/purchasing/service'
import { SYSTEM_CONTEXT } from '@/lib/authz/types'
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

    const result = await service.postGoodsReceipt(SYSTEM_CONTEXT, tenant.id, receipt.id)

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

    await service.postGoodsReceipt(SYSTEM_CONTEXT, tenant.id, receipt.id)
    const second = await service.postGoodsReceipt(SYSTEM_CONTEXT, tenant.id, receipt.id)

    expect(second.lines[0].status).toBe('duplicate')
    const balance = await readInventoryBalance(db, tenant.id, physicalBranch.id, 'SKU-1')
    expect(balance).toBe(15)
  })
})

describe('PurchasingService — full PO lifecycle', () => {
  async function seedSupplier(db: Awaited<ReturnType<typeof createTestDb>>, tenantId: string) {
    const [supplier] = await db.insert(suppliers).values({ tenantId, name: 'Test Supplier' }).returning()
    return supplier
  }

  it('creates a draft PO with lines', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    const supplier = await seedSupplier(db, tenant.id)
    const service = createPurchasingService(db)

    const { purchaseOrderId } = await service.createPurchaseOrder(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      branchId: physicalBranch.id,
      supplierId: supplier.id,
      poNumber: 'PO-1',
      orderDate: '2026-07-20',
      lines: [{ sku: 'SKU-1', productName: 'Widget', quantityOrdered: 10, unitCost: 20 }],
    })

    expect(purchaseOrderId).toBeTruthy()
  })

  it('moves a draft PO to sent, and rejects sending it twice', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    const supplier = await seedSupplier(db, tenant.id)
    const service = createPurchasingService(db)

    const { purchaseOrderId } = await service.createPurchaseOrder(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      branchId: physicalBranch.id,
      supplierId: supplier.id,
      poNumber: 'PO-1',
      orderDate: '2026-07-20',
      lines: [{ sku: 'SKU-1', productName: 'Widget', quantityOrdered: 10, unitCost: 20 }],
    })

    await service.sendPurchaseOrder(SYSTEM_CONTEXT, tenant.id, purchaseOrderId)
    await expect(service.sendPurchaseOrder(SYSTEM_CONTEXT, tenant.id, purchaseOrderId)).rejects.toThrow('can only send a draft PO')
  })

  it('receiving the full ordered quantity in one shipment marks the PO received and posts inventory', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    const supplier = await seedSupplier(db, tenant.id)
    const service = createPurchasingService(db)

    const { purchaseOrderId } = await service.createPurchaseOrder(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      branchId: physicalBranch.id,
      supplierId: supplier.id,
      poNumber: 'PO-1',
      orderDate: '2026-07-20',
      lines: [{ sku: 'SKU-1', productName: 'Widget', quantityOrdered: 10, unitCost: 20 }],
    })
    await service.sendPurchaseOrder(SYSTEM_CONTEXT, tenant.id, purchaseOrderId)

    const result = await service.receivePurchaseOrder(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      purchaseOrderId,
      receiptNumber: 'GR-1',
      receivedDate: '2026-07-21',
      lines: [{ sku: 'SKU-1', quantityReceived: 10, unitCost: 20 }],
    })

    expect(result.poStatus).toBe('received')
    const balance = await readInventoryBalance(db, tenant.id, physicalBranch.id, 'SKU-1')
    expect(balance).toBe(10)
  })

  it('receiving less than ordered marks the PO partially_received, and a second shipment completes it', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    const supplier = await seedSupplier(db, tenant.id)
    const service = createPurchasingService(db)

    const { purchaseOrderId } = await service.createPurchaseOrder(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      branchId: physicalBranch.id,
      supplierId: supplier.id,
      poNumber: 'PO-1',
      orderDate: '2026-07-20',
      lines: [{ sku: 'SKU-1', productName: 'Widget', quantityOrdered: 10, unitCost: 20 }],
    })
    await service.sendPurchaseOrder(SYSTEM_CONTEXT, tenant.id, purchaseOrderId)

    const first = await service.receivePurchaseOrder(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      purchaseOrderId,
      receiptNumber: 'GR-1',
      receivedDate: '2026-07-21',
      lines: [{ sku: 'SKU-1', quantityReceived: 6, unitCost: 20 }],
    })
    expect(first.poStatus).toBe('partially_received')

    const second = await service.receivePurchaseOrder(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      purchaseOrderId,
      receiptNumber: 'GR-2',
      receivedDate: '2026-07-22',
      lines: [{ sku: 'SKU-1', quantityReceived: 4, unitCost: 20 }],
    })
    expect(second.poStatus).toBe('received')

    const balance = await readInventoryBalance(db, tenant.id, physicalBranch.id, 'SKU-1')
    expect(balance).toBe(10)
  })

  it('rejects receiving a sku that is not on the PO', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    const supplier = await seedSupplier(db, tenant.id)
    const service = createPurchasingService(db)

    const { purchaseOrderId } = await service.createPurchaseOrder(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      branchId: physicalBranch.id,
      supplierId: supplier.id,
      poNumber: 'PO-1',
      orderDate: '2026-07-20',
      lines: [{ sku: 'SKU-1', productName: 'Widget', quantityOrdered: 10, unitCost: 20 }],
    })

    await expect(
      service.receivePurchaseOrder(SYSTEM_CONTEXT, {
        tenantId: tenant.id,
        purchaseOrderId,
        receiptNumber: 'GR-1',
        receivedDate: '2026-07-21',
        lines: [{ sku: 'SKU-UNKNOWN', quantityReceived: 1, unitCost: 20 }],
      })
    ).rejects.toThrow('is not on purchase_order')
  })

  it('rejects receiving against an already-received PO', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    const supplier = await seedSupplier(db, tenant.id)
    const service = createPurchasingService(db)

    const { purchaseOrderId } = await service.createPurchaseOrder(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      branchId: physicalBranch.id,
      supplierId: supplier.id,
      poNumber: 'PO-1',
      orderDate: '2026-07-20',
      lines: [{ sku: 'SKU-1', productName: 'Widget', quantityOrdered: 10, unitCost: 20 }],
    })
    await service.receivePurchaseOrder(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      purchaseOrderId,
      receiptNumber: 'GR-1',
      receivedDate: '2026-07-21',
      lines: [{ sku: 'SKU-1', quantityReceived: 10, unitCost: 20 }],
    })

    await expect(
      service.receivePurchaseOrder(SYSTEM_CONTEXT, {
        tenantId: tenant.id,
        purchaseOrderId,
        receiptNumber: 'GR-2',
        receivedDate: '2026-07-22',
        lines: [{ sku: 'SKU-1', quantityReceived: 1, unitCost: 20 }],
      })
    ).rejects.toThrow('cannot receive against it')
  })
})

describe('PurchasingService — RBAC', () => {
  it('rejects staff creating a purchase order (purchasing is a commitment decision, not a physical-receiving task)', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    const [supplier] = await db.insert(suppliers).values({ tenantId: tenant.id, name: 'S1' }).returning()
    const service = createPurchasingService(db)
    const staff = { userId: 'user-1', role: 'staff' as const, branchAccess: { type: 'all' as const } }

    await expect(
      service.createPurchaseOrder(staff, {
        tenantId: tenant.id,
        branchId: physicalBranch.id,
        supplierId: supplier.id,
        poNumber: 'PO-RBAC-1',
        orderDate: '2026-07-20',
        lines: [{ sku: 'SKU-1', productName: 'Widget', quantityOrdered: 10, unitCost: 20 }],
      })
    ).rejects.toThrow('role "staff"')
  })

  it('allows staff to physically receive against a PO at their own branch', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    const [supplier] = await db.insert(suppliers).values({ tenantId: tenant.id, name: 'S1' }).returning()
    const service = createPurchasingService(db)
    const staff = {
      userId: 'user-1',
      role: 'staff' as const,
      branchAccess: { type: 'list' as const, branchIds: [physicalBranch.id] },
    }

    const { purchaseOrderId } = await service.createPurchaseOrder(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      branchId: physicalBranch.id,
      supplierId: supplier.id,
      poNumber: 'PO-RBAC-2',
      orderDate: '2026-07-20',
      lines: [{ sku: 'SKU-1', productName: 'Widget', quantityOrdered: 10, unitCost: 20 }],
    })

    const result = await service.receivePurchaseOrder(staff, {
      tenantId: tenant.id,
      purchaseOrderId,
      receiptNumber: 'GR-RBAC-1',
      receivedDate: '2026-07-21',
      lines: [{ sku: 'SKU-1', quantityReceived: 10, unitCost: 20 }],
    })

    expect(result.poStatus).toBe('received')
  })
})

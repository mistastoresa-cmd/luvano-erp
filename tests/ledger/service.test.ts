import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { createLedgerService } from '@/lib/ledger/service'
import { saleInvoiceLines, inventoryMovements } from '@/db/schema'

describe('LedgerService.recordSaleInvoice', () => {
  it('writes invoice + lines + movements + balance atomically', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    const ledger = createLedgerService(db)

    await ledger.recordInventoryMovement({
      tenantId: tenant.id,
      branchId: physicalBranch.id,
      sku: 'SKU-1',
      quantityDelta: 20,
      reason: 'initial_stock',
      sourceType: 'manual_adjustment',
      idempotencyKey: 'initial-stock-sku-1',
      occurredAt: new Date(),
    })

    const result = await ledger.recordSaleInvoice({
      tenantId: tenant.id,
      branchId: physicalBranch.id,
      sourceType: 'branch_pos',
      idempotencyKey: 'invoice-1',
      occurredAt: new Date(),
      invoiceNumber: 'INV-0001',
      lines: [{ sku: 'SKU-1', productName: 'Test Product', quantity: 3, unitPrice: 50 }],
    })

    expect(result.status).toBe('accepted')
    expect(result.movements).toHaveLength(1)
    expect(result.movements[0].resultingQuantity).toBe(17)

    const lines = await db
      .select()
      .from(saleInvoiceLines)
      .where(eq(saleInvoiceLines.invoiceId, result.invoiceId!))
    expect(lines).toHaveLength(1)
    expect(lines[0].lineTotal).toBe('150.00')

    const balance = await ledger.getInventoryBalance(tenant.id, physicalBranch.id, 'SKU-1')
    expect(balance).toBe(17)
  })

  it('dedupes a resubmitted invoice with the same idempotency key', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    const ledger = createLedgerService(db)

    const input = {
      tenantId: tenant.id,
      branchId: physicalBranch.id,
      sourceType: 'branch_offline' as const,
      idempotencyKey: 'offline-invoice-1',
      occurredAt: new Date(),
      invoiceNumber: 'INV-0002',
      lines: [{ sku: 'SKU-2', productName: 'Test Product 2', quantity: 1, unitPrice: 30 }],
    }

    const first = await ledger.recordSaleInvoice(input)
    expect(first.status).toBe('accepted')

    // Simulates the PWA retrying a sync call after a timeout that had actually
    // succeeded server-side.
    const second = await ledger.recordSaleInvoice(input)
    expect(second.status).toBe('duplicate')
    expect(second.invoiceId).toBe(first.invoiceId)

    const movements = await db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.saleInvoiceId, first.invoiceId!))
    expect(movements).toHaveLength(1)
  })
})

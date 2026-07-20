import { describe, it, expect } from 'vitest'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { tenants, branches, inventoryMovements } from '@/db/schema'
import { eq } from 'drizzle-orm'

describe('schema migration', () => {
  it('applies cleanly and all core tables are queryable', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)

    const [row] = await db.select().from(tenants).where(eq(tenants.id, tenant.id))
    expect(row.name).toBe('Test Tenant')

    const branchRows = await db.select().from(branches).where(eq(branches.tenantId, tenant.id))
    expect(branchRows).toHaveLength(2)
    expect(physicalBranch.type).toBe('physical')
  })

  it('enforces the unique (tenant_id, idempotency_key) constraint on inventory_movements', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)

    await db.insert(inventoryMovements).values({
      tenantId: tenant.id,
      branchId: physicalBranch.id,
      sku: 'SKU-1',
      quantityDelta: -1,
      reason: 'sale',
      sourceType: 'branch_pos',
      idempotencyKey: 'dup-key',
      occurredAt: new Date(),
    })

    await expect(
      db.insert(inventoryMovements).values({
        tenantId: tenant.id,
        branchId: physicalBranch.id,
        sku: 'SKU-1',
        quantityDelta: -1,
        reason: 'sale',
        sourceType: 'branch_pos',
        idempotencyKey: 'dup-key',
        occurredAt: new Date(),
      })
    ).rejects.toThrow()
  })
})

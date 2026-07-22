import { describe, it, expect } from 'vitest'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { createAccountingService } from '@/lib/accounting/service'
import { createDocumentFlowService } from '@/lib/document-flow/service'
import {
  chartOfAccounts,
  accountMappings,
  saleInvoices,
  saleInvoiceLines,
  inventoryMovements,
} from '@/db/schema'
import type { AccountMappingKey } from '@/lib/accounting/types'
import { SYSTEM_CONTEXT } from '@/lib/authz/types'
import type { CallerContext } from '@/lib/authz/types'

async function seedMappings(db: Awaited<ReturnType<typeof createTestDb>>, tenantId: string) {
  const keys: { key: AccountMappingKey; code: string; name: string; type: 'asset' | 'liability' | 'revenue' | 'expense' }[] = [
    { key: 'cash', code: '1000', name: 'Cash', type: 'asset' },
    { key: 'inventory_asset', code: '1100', name: 'Inventory', type: 'asset' },
    { key: 'accounts_payable', code: '2000', name: 'Accounts Payable', type: 'liability' },
    { key: 'output_tax_payable', code: '2100', name: 'Output Tax Payable', type: 'liability' },
    { key: 'sales_revenue', code: '4000', name: 'Sales Revenue', type: 'revenue' },
    { key: 'cogs', code: '5000', name: 'COGS', type: 'expense' },
  ]
  for (const k of keys) {
    const [account] = await db
      .insert(chartOfAccounts)
      .values({ tenantId, code: k.code, name: k.name, type: k.type })
      .returning()
    await db.insert(accountMappings).values({ tenantId, key: k.key, accountId: account.id })
  }
}

describe('DocumentFlowService.getSaleInvoiceDocumentFlow', () => {
  it('assembles invoice, line inventory movements, and journal entry for a posted sale', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    await seedMappings(db, tenant.id)
    const accounting = createAccountingService(db)
    const documentFlow = createDocumentFlowService(db)

    const [movement] = await db
      .insert(inventoryMovements)
      .values({
        tenantId: tenant.id,
        branchId: physicalBranch.id,
        sku: 'SKU-1',
        quantityDelta: -2,
        reason: 'sale',
        sourceType: 'branch_pos',
        idempotencyKey: 'move-1',
        occurredAt: new Date('2026-07-10'),
      })
      .returning()

    const [invoice] = await db
      .insert(saleInvoices)
      .values({
        tenantId: tenant.id,
        branchId: physicalBranch.id,
        invoiceNumber: 'INV-DF-1',
        sourceType: 'branch_pos',
        customerName: 'أحمد',
        subtotal: '200.00',
        total: '200.00',
        idempotencyKey: 'df-inv-1',
        occurredAt: new Date('2026-07-10'),
      })
      .returning()

    await db.insert(saleInvoiceLines).values({
      invoiceId: invoice.id,
      sku: 'SKU-1',
      productName: 'عود ملكي',
      quantity: 2,
      unitPrice: '100.00',
      lineTotal: '200.00',
      inventoryMovementId: movement.id,
    })

    await accounting.postSaleInvoiceJournal(SYSTEM_CONTEXT, tenant.id, invoice.id)

    const ownerContext: CallerContext = {
      userId: 'user-owner',
      role: 'owner',
      branchAccess: { type: 'all' },
    }

    const flow = await documentFlow.getSaleInvoiceDocumentFlow(ownerContext, tenant.id, invoice.id)

    expect(flow.invoice.invoiceNumber).toBe('INV-DF-1')
    expect(flow.lines).toHaveLength(1)
    expect(flow.lines[0].movement?.inventoryMovementId).toBe(movement.id)
    expect(flow.lines[0].movement?.quantityDelta).toBe(-2)
    expect(flow.journalEntry).not.toBeNull()
    expect(flow.journalEntry?.status).toBe('posted')
    expect(flow.journalEntry?.lines.length).toBeGreaterThan(0)
  })

  it('leaves journalEntry null for an unposted invoice', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    await seedMappings(db, tenant.id)
    const documentFlow = createDocumentFlowService(db)

    const [invoice] = await db
      .insert(saleInvoices)
      .values({
        tenantId: tenant.id,
        branchId: physicalBranch.id,
        invoiceNumber: 'INV-DF-2',
        sourceType: 'branch_pos',
        subtotal: '50.00',
        total: '50.00',
        idempotencyKey: 'df-inv-2',
        occurredAt: new Date('2026-07-11'),
      })
      .returning()

    const ownerContext: CallerContext = {
      userId: 'user-owner',
      role: 'owner',
      branchAccess: { type: 'all' },
    }

    const flow = await documentFlow.getSaleInvoiceDocumentFlow(ownerContext, tenant.id, invoice.id)
    expect(flow.journalEntry).toBeNull()
    expect(flow.lines).toHaveLength(0)
  })

  it('rejects a staff member without access to the invoice branch', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    await seedMappings(db, tenant.id)
    const documentFlow = createDocumentFlowService(db)

    const [invoice] = await db
      .insert(saleInvoices)
      .values({
        tenantId: tenant.id,
        branchId: physicalBranch.id,
        invoiceNumber: 'INV-DF-3',
        sourceType: 'branch_pos',
        subtotal: '50.00',
        total: '50.00',
        idempotencyKey: 'df-inv-3',
        occurredAt: new Date('2026-07-11'),
      })
      .returning()

    const staffContext: CallerContext = {
      userId: 'user-staff',
      role: 'staff',
      branchAccess: { type: 'list', branchIds: ['some-other-branch'] },
    }

    await expect(
      documentFlow.getSaleInvoiceDocumentFlow(staffContext, tenant.id, invoice.id)
    ).rejects.toThrow()
  })
})

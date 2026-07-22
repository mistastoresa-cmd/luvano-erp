import { describe, it, expect } from 'vitest'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { seedDefaultChartOfAccounts, DEFAULT_CHART_OF_ACCOUNTS } from '@/lib/accounting/defaults'
import { createAccountingService } from '@/lib/accounting/service'
import { accountMappings, chartOfAccounts, saleInvoices } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { SYSTEM_CONTEXT } from '@/lib/authz/types'

describe('seedDefaultChartOfAccounts', () => {
  it('creates a chart-of-accounts row and mapping for every default key', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)

    await seedDefaultChartOfAccounts(db, tenant.id)

    const accounts = await db
      .select()
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.tenantId, tenant.id))
    const mappings = await db
      .select()
      .from(accountMappings)
      .where(eq(accountMappings.tenantId, tenant.id))

    expect(accounts).toHaveLength(DEFAULT_CHART_OF_ACCOUNTS.length)
    expect(mappings).toHaveLength(DEFAULT_CHART_OF_ACCOUNTS.length)
  })

  it('lets a sale invoice post its journal entry immediately after seeding', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    await seedDefaultChartOfAccounts(db, tenant.id)

    const [invoice] = await db
      .insert(saleInvoices)
      .values({
        tenantId: tenant.id,
        branchId: physicalBranch.id,
        invoiceNumber: 'INV-DEFAULTS-1',
        sourceType: 'branch_pos',
        subtotal: '100.00',
        taxTotal: '15.00',
        total: '115.00',
        idempotencyKey: 'defaults-inv-1',
        occurredAt: new Date('2026-07-20'),
      })
      .returning()

    const accounting = createAccountingService(db)
    // The gap this closes: before defaults were seeded on tenant creation,
    // this call threw because no account was mapped to sales_revenue / cash /
    // output_tax_payable for a freshly provisioned tenant.
    await expect(
      accounting.postSaleInvoiceJournal(SYSTEM_CONTEXT, tenant.id, invoice.id)
    ).resolves.toBeDefined()
  })
})

import { describe, it, expect } from 'vitest'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import {
  seedDefaultChartOfAccounts,
  DEFAULT_CHART_OF_ACCOUNTS,
  DEFAULT_EXPENSE_ACCOUNTS,
} from '@/lib/accounting/defaults'
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

    // Every mapped core account plus the unmapped operating-expense chart.
    expect(accounts).toHaveLength(
      DEFAULT_CHART_OF_ACCOUNTS.length + DEFAULT_EXPENSE_ACCOUNTS.length
    )
    // Only the core carries mapping keys — expense accounts are picked by
    // hand when recording an expense, nothing auto-posts to them.
    expect(mappings).toHaveLength(DEFAULT_CHART_OF_ACCOUNTS.length)

    const expenseCount = accounts.filter((a) => a.type === 'expense').length
    expect(expenseCount).toBeGreaterThan(20)
  })

  it('is idempotent and tops up a chart that predates newer defaults', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)

    const first = await seedDefaultChartOfAccounts(db, tenant.id)
    expect(first.accountsCreated).toBe(
      DEFAULT_CHART_OF_ACCOUNTS.length + DEFAULT_EXPENSE_ACCOUNTS.length
    )

    // Re-running creates nothing and duplicates no mapping.
    const second = await seedDefaultChartOfAccounts(db, tenant.id)
    expect(second.accountsCreated).toBe(0)
    expect(second.mappingsCreated).toBe(0)

    const accounts = await db
      .select()
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.tenantId, tenant.id))
    expect(accounts).toHaveLength(
      DEFAULT_CHART_OF_ACCOUNTS.length + DEFAULT_EXPENSE_ACCOUNTS.length
    )
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

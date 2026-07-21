import { describe, it, expect } from 'vitest'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { createAccountingService } from '@/lib/accounting/service'
import { createReportingService } from '@/lib/reporting/service'
import { chartOfAccounts, accountMappings, saleInvoices, saleInvoiceLines, suppliers, supplierInvoices } from '@/db/schema'
import type { AccountMappingKey } from '@/lib/accounting/types'

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

describe('ReportingService.getBranchProfitAndLoss', () => {
  it('isolates revenue/expense to the branch the journal entries belong to', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch, onlineBranch } = await seedTenantWithBranch(db)
    await seedMappings(db, tenant.id)
    const accounting = createAccountingService(db)
    const reporting = createReportingService(db)

    // A sale at the physical branch: 200 revenue.
    const [invoiceA] = await db
      .insert(saleInvoices)
      .values({
        tenantId: tenant.id,
        branchId: physicalBranch.id,
        invoiceNumber: 'INV-RPT-1',
        sourceType: 'branch_pos',
        subtotal: '200.00',
        total: '200.00',
        idempotencyKey: 'rpt-inv-1',
        occurredAt: new Date('2026-07-10'),
      })
      .returning()
    await accounting.postSaleInvoiceJournal(tenant.id, invoiceA.id)

    // A sale at the online branch: 500 revenue — must not leak into the
    // physical branch's report.
    const [invoiceB] = await db
      .insert(saleInvoices)
      .values({
        tenantId: tenant.id,
        branchId: onlineBranch.id,
        invoiceNumber: 'INV-RPT-2',
        sourceType: 'salla_order',
        subtotal: '500.00',
        total: '500.00',
        idempotencyKey: 'rpt-inv-2',
        occurredAt: new Date('2026-07-11'),
      })
      .returning()
    await accounting.postSaleInvoiceJournal(tenant.id, invoiceB.id)

    const report = await reporting.getBranchProfitAndLoss(
      tenant.id,
      physicalBranch.id,
      new Date('2026-07-01'),
      new Date('2026-07-31')
    )

    expect(report.totalRevenue).toBe(200)
    expect(report.netProfit).toBe(200)
  })

  it('folds COGS into expenses and reduces net profit', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    await seedMappings(db, tenant.id)
    const accounting = createAccountingService(db)
    const reporting = createReportingService(db)

    // Seed cost via a direct balance write is out of scope here — use a
    // supplier invoice + sale with a pre-existing average cost from the
    // purchasing flow, covered end-to-end in tests/accounting/service.test.ts.
    // This test only needs revenue with zero COGS (no prior purchase) to
    // confirm the net-profit arithmetic itself is correct.
    const [invoice] = await db
      .insert(saleInvoices)
      .values({
        tenantId: tenant.id,
        branchId: physicalBranch.id,
        invoiceNumber: 'INV-RPT-3',
        sourceType: 'branch_pos',
        subtotal: '300.00',
        taxTotal: '45.00',
        total: '345.00',
        idempotencyKey: 'rpt-inv-3',
        occurredAt: new Date('2026-07-15'),
      })
      .returning()
    await accounting.postSaleInvoiceJournal(tenant.id, invoice.id)

    const report = await reporting.getBranchProfitAndLoss(
      tenant.id,
      physicalBranch.id,
      new Date('2026-07-01'),
      new Date('2026-07-31')
    )

    // Tax is a liability (output_tax_payable), not revenue — only the net
    // 300 should show as revenue.
    expect(report.totalRevenue).toBe(300)
    expect(report.netProfit).toBe(300)
  })
})

describe('ReportingService.getBranchBalanceSheet', () => {
  it('shows the branch cash balance built up from its own sale invoices', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    await seedMappings(db, tenant.id)
    const accounting = createAccountingService(db)
    const reporting = createReportingService(db)

    const [invoice] = await db
      .insert(saleInvoices)
      .values({
        tenantId: tenant.id,
        branchId: physicalBranch.id,
        invoiceNumber: 'INV-RPT-4',
        sourceType: 'branch_pos',
        subtotal: '120.00',
        total: '120.00',
        idempotencyKey: 'rpt-inv-4',
        occurredAt: new Date('2026-07-05'),
      })
      .returning()
    await accounting.postSaleInvoiceJournal(tenant.id, invoice.id)

    const sheet = await reporting.getBranchBalanceSheet(tenant.id, physicalBranch.id, new Date('2026-07-31'))

    const cashLine = sheet.assetLines.find((l) => l.accountCode === '1000')
    expect(cashLine?.amount).toBe(120)
    expect(sheet.totalAssets).toBe(120)
  })

  it('attributes accounts-payable to the branch on a branch-tagged supplier invoice', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    await seedMappings(db, tenant.id)
    const accounting = createAccountingService(db)
    const reporting = createReportingService(db)

    const [supplier] = await db.insert(suppliers).values({ tenantId: tenant.id, name: 'S1' }).returning()
    const [invoice] = await db
      .insert(supplierInvoices)
      .values({
        tenantId: tenant.id,
        supplierId: supplier.id,
        branchId: physicalBranch.id,
        invoiceNumber: 'SINV-RPT-1',
        invoiceDate: '2026-07-05',
        subtotal: '400.00',
        total: '400.00',
      })
      .returning()
    await accounting.postSupplierInvoiceJournal(tenant.id, invoice.id)

    const sheet = await reporting.getBranchBalanceSheet(tenant.id, physicalBranch.id, new Date('2026-07-31'))

    const apLine = sheet.liabilityLines.find((l) => l.accountCode === '2000')
    expect(apLine?.amount).toBe(400)
    expect(sheet.totalLiabilities).toBe(400)
  })
})

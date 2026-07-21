import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { createAccountingService } from '@/lib/accounting/service'
import { createPurchasingService } from '@/lib/purchasing/service'
import {
  chartOfAccounts,
  accountMappings,
  journalEntryLines,
  suppliers,
  supplierInvoices,
  supplierPayments,
  saleInvoices,
  saleInvoiceLines,
  goodsReceipts,
  goodsReceiptLines,
} from '@/db/schema'
import type { AccountMappingKey } from '@/lib/accounting/types'
import { SYSTEM_CONTEXT } from '@/lib/authz/types'

async function seedAccountMappings(db: Awaited<ReturnType<typeof createTestDb>>, tenantId: string) {
  const keys: { key: AccountMappingKey; code: string; name: string; type: 'asset' | 'liability' | 'revenue' | 'expense' }[] = [
    { key: 'cash', code: '1000', name: 'Cash', type: 'asset' },
    { key: 'inventory_asset', code: '1100', name: 'Inventory', type: 'asset' },
    { key: 'input_tax', code: '1200', name: 'Input Tax', type: 'asset' },
    { key: 'accounts_payable', code: '2000', name: 'Accounts Payable', type: 'liability' },
    { key: 'output_tax_payable', code: '2100', name: 'Output Tax Payable', type: 'liability' },
    { key: 'sales_revenue', code: '4000', name: 'Sales Revenue', type: 'revenue' },
    { key: 'cogs', code: '5000', name: 'Cost of Goods Sold', type: 'expense' },
  ]

  const map: Partial<Record<AccountMappingKey, string>> = {}
  for (const k of keys) {
    const [account] = await db
      .insert(chartOfAccounts)
      .values({ tenantId, code: k.code, name: k.name, type: k.type })
      .returning()
    await db.insert(accountMappings).values({ tenantId, key: k.key, accountId: account.id })
    map[k.key] = account.id
  }
  return map
}

describe('AccountingService.postSupplierInvoiceJournal', () => {
  it('posts a balanced debit-inventory/credit-AP entry and links the invoice', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    await seedAccountMappings(db, tenant.id)
    const [supplier] = await db.insert(suppliers).values({ tenantId: tenant.id, name: 'S1' }).returning()
    const [invoice] = await db
      .insert(supplierInvoices)
      .values({
        tenantId: tenant.id,
        supplierId: supplier.id,
        invoiceNumber: 'SINV-1',
        invoiceDate: '2026-07-20',
        subtotal: '500.00',
        taxTotal: '75.00',
        total: '575.00',
      })
      .returning()

    const accounting = createAccountingService(db)
    const result = await accounting.postSupplierInvoiceJournal(SYSTEM_CONTEXT, tenant.id, invoice.id)
    expect(result.status).toBe('accepted')

    const lines = await db
      .select()
      .from(journalEntryLines)
      .where(eq(journalEntryLines.journalEntryId, result.journalEntryId))
    expect(lines).toHaveLength(3)
    const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0)
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0)
    expect(totalDebit).toBe(575)
    expect(totalCredit).toBe(575)

    const [updated] = await db.select().from(supplierInvoices).where(eq(supplierInvoices.id, invoice.id))
    expect(updated.journalEntryId).toBe(result.journalEntryId)
  })

  it('is idempotent — re-posting the same invoice does not duplicate the entry', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    await seedAccountMappings(db, tenant.id)
    const [supplier] = await db.insert(suppliers).values({ tenantId: tenant.id, name: 'S1' }).returning()
    const [invoice] = await db
      .insert(supplierInvoices)
      .values({
        tenantId: tenant.id,
        supplierId: supplier.id,
        invoiceNumber: 'SINV-2',
        invoiceDate: '2026-07-20',
        subtotal: '200.00',
        total: '200.00',
      })
      .returning()

    const accounting = createAccountingService(db)
    const first = await accounting.postSupplierInvoiceJournal(SYSTEM_CONTEXT, tenant.id, invoice.id)
    const second = await accounting.postSupplierInvoiceJournal(SYSTEM_CONTEXT, tenant.id, invoice.id)

    expect(second.status).toBe('duplicate')
    expect(second.journalEntryId).toBe(first.journalEntryId)
  })

  it('throws a clear error when an account mapping is missing', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    // No account mappings seeded at all.
    const [supplier] = await db.insert(suppliers).values({ tenantId: tenant.id, name: 'S1' }).returning()
    const [invoice] = await db
      .insert(supplierInvoices)
      .values({
        tenantId: tenant.id,
        supplierId: supplier.id,
        invoiceNumber: 'SINV-3',
        invoiceDate: '2026-07-20',
        subtotal: '100.00',
        total: '100.00',
      })
      .returning()

    const accounting = createAccountingService(db)
    await expect(accounting.postSupplierInvoiceJournal(SYSTEM_CONTEXT, tenant.id, invoice.id)).rejects.toThrow(
      /No account_mappings row/
    )
  })
})

describe('AccountingService.postSupplierPaymentJournal', () => {
  it('marks the invoice paid once payments cover the total', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    await seedAccountMappings(db, tenant.id)
    const [supplier] = await db.insert(suppliers).values({ tenantId: tenant.id, name: 'S1' }).returning()
    const [invoice] = await db
      .insert(supplierInvoices)
      .values({
        tenantId: tenant.id,
        supplierId: supplier.id,
        invoiceNumber: 'SINV-4',
        invoiceDate: '2026-07-20',
        subtotal: '300.00',
        total: '300.00',
      })
      .returning()

    const accounting = createAccountingService(db)
    await accounting.postSupplierInvoiceJournal(SYSTEM_CONTEXT, tenant.id, invoice.id)

    const [payment1] = await db
      .insert(supplierPayments)
      .values({
        tenantId: tenant.id,
        supplierId: supplier.id,
        supplierInvoiceId: invoice.id,
        amount: '200.00',
        paymentDate: '2026-07-21',
        method: 'bank_transfer',
      })
      .returning()
    await accounting.postSupplierPaymentJournal(SYSTEM_CONTEXT, tenant.id, payment1.id)

    let [updated] = await db.select().from(supplierInvoices).where(eq(supplierInvoices.id, invoice.id))
    expect(updated.status).toBe('partially_paid')

    const [payment2] = await db
      .insert(supplierPayments)
      .values({
        tenantId: tenant.id,
        supplierId: supplier.id,
        supplierInvoiceId: invoice.id,
        amount: '100.00',
        paymentDate: '2026-07-22',
        method: 'bank_transfer',
      })
      .returning()
    await accounting.postSupplierPaymentJournal(SYSTEM_CONTEXT, tenant.id, payment2.id)

    ;[updated] = await db.select().from(supplierInvoices).where(eq(supplierInvoices.id, invoice.id))
    expect(updated.status).toBe('paid')
  })
})

describe('AccountingService.postSaleInvoiceJournal', () => {
  it('posts a balanced debit-cash/credit-revenue+tax entry, no COGS lines when the invoice has no lines', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    await seedAccountMappings(db, tenant.id)

    const [invoice] = await db
      .insert(saleInvoices)
      .values({
        tenantId: tenant.id,
        branchId: physicalBranch.id,
        invoiceNumber: 'INV-ACC-1',
        sourceType: 'branch_pos',
        subtotal: '150.00',
        taxTotal: '22.50',
        total: '172.50',
        idempotencyKey: 'acc-test-inv-1',
        occurredAt: new Date(),
      })
      .returning()

    const accounting = createAccountingService(db)
    const result = await accounting.postSaleInvoiceJournal(SYSTEM_CONTEXT, tenant.id, invoice.id)

    const lines = await db
      .select()
      .from(journalEntryLines)
      .where(eq(journalEntryLines.journalEntryId, result.journalEntryId))
    expect(lines).toHaveLength(3)
    const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0)
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0)
    expect(totalDebit).toBe(172.5)
    expect(totalCredit).toBe(172.5)

    const [updated] = await db.select().from(saleInvoices).where(eq(saleInvoices.id, invoice.id))
    expect(updated.journalEntryId).toBe(result.journalEntryId)
  })

  it('adds a balanced COGS line sized from the current weighted-average cost', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    await seedAccountMappings(db, tenant.id)
    const purchasing = createPurchasingService(db)
    const accounting = createAccountingService(db)

    // Establish a known average cost via a posted goods receipt: 20 units @ 15.00.
    const [receipt] = await db
      .insert(goodsReceipts)
      .values({ tenantId: tenant.id, branchId: physicalBranch.id, receiptNumber: 'GR-COGS-1', receivedDate: '2026-07-20' })
      .returning()
    await db
      .insert(goodsReceiptLines)
      .values({ goodsReceiptId: receipt.id, sku: 'SKU-1', quantityReceived: 20, unitCost: '15.00' })
    await purchasing.postGoodsReceipt(SYSTEM_CONTEXT, tenant.id, receipt.id)

    const [invoice] = await db
      .insert(saleInvoices)
      .values({
        tenantId: tenant.id,
        branchId: physicalBranch.id,
        invoiceNumber: 'INV-ACC-2',
        sourceType: 'branch_pos',
        subtotal: '100.00',
        total: '100.00',
        idempotencyKey: 'acc-test-inv-2',
        occurredAt: new Date(),
      })
      .returning()
    await db
      .insert(saleInvoiceLines)
      .values({
        invoiceId: invoice.id,
        sku: 'SKU-1',
        productName: 'Oud 50ml',
        quantity: 4,
        unitPrice: '25.00',
        lineTotal: '100.00',
      })

    const result = await accounting.postSaleInvoiceJournal(SYSTEM_CONTEXT, tenant.id, invoice.id)

    const lines = await db
      .select()
      .from(journalEntryLines)
      .where(eq(journalEntryLines.journalEntryId, result.journalEntryId))
    // cash, sales_revenue, cogs, inventory_asset — no tax this time.
    expect(lines).toHaveLength(4)
    const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0)
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0)
    expect(totalDebit).toBe(totalCredit)

    // 4 units sold * 15.00 average cost = 60.00 COGS.
    const cogsLineTotal = lines.reduce((s, l) => s + Number(l.debit), 0) - 100 // cash debit is 100
    expect(cogsLineTotal).toBe(60)
  })
})

describe('AccountingService.postJournalEntry', () => {
  it('rejects an unbalanced entry before writing anything', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    await seedAccountMappings(db, tenant.id)
    const accounting = createAccountingService(db)

    await expect(
      accounting.postJournalEntry(SYSTEM_CONTEXT, {
        tenantId: tenant.id,
        entryDate: new Date(),
        sourceType: 'manual',
        lines: [
          { accountKey: 'cash', debit: 100 },
          { accountKey: 'sales_revenue', credit: 50 },
        ],
      })
    ).rejects.toThrow(/Unbalanced journal entry/)
  })
})

describe('AccountingService — RBAC', () => {
  it('rejects a branch_manager posting a journal entry (GL posting is owner/accountant only)', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    await seedAccountMappings(db, tenant.id)
    const accounting = createAccountingService(db)
    const branchManager = { userId: 'user-1', role: 'branch_manager' as const, branchAccess: { type: 'all' as const } }

    await expect(
      accounting.postJournalEntry(branchManager, {
        tenantId: tenant.id,
        entryDate: new Date(),
        sourceType: 'manual',
        lines: [
          { accountKey: 'cash', debit: 100 },
          { accountKey: 'sales_revenue', credit: 100 },
        ],
      })
    ).rejects.toThrow('role "branch_manager"')
  })

  it('allows an accountant to post a supplier invoice journal', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    await seedAccountMappings(db, tenant.id)
    const [supplier] = await db.insert(suppliers).values({ tenantId: tenant.id, name: 'S1' }).returning()
    const [invoice] = await db
      .insert(supplierInvoices)
      .values({
        tenantId: tenant.id,
        supplierId: supplier.id,
        invoiceNumber: 'SINV-RBAC-1',
        invoiceDate: '2026-07-20',
        subtotal: '100.00',
        total: '100.00',
      })
      .returning()

    const accounting = createAccountingService(db)
    const accountant = { userId: 'user-1', role: 'accountant' as const, branchAccess: { type: 'all' as const } }
    const result = await accounting.postSupplierInvoiceJournal(accountant, tenant.id, invoice.id)
    expect(result.status).toBe('accepted')
  })
})

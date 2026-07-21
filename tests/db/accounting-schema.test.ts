import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { chartOfAccounts, journalEntries, journalEntryLines } from '@/db/schema'

describe('accounting schema', () => {
  it('supports a self-referencing chart-of-accounts hierarchy', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)

    const [cash] = await db
      .insert(chartOfAccounts)
      .values({ tenantId: tenant.id, code: '1000', name: 'Assets', type: 'asset' })
      .returning()
    const [pettyCash] = await db
      .insert(chartOfAccounts)
      .values({
        tenantId: tenant.id,
        code: '1010',
        name: 'Petty Cash',
        type: 'asset',
        parentId: cash.id,
      })
      .returning()

    expect(pettyCash.parentId).toBe(cash.id)
  })

  it('enforces unique (tenant_id, code) on chart_of_accounts', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)

    await db
      .insert(chartOfAccounts)
      .values({ tenantId: tenant.id, code: '1000', name: 'Assets', type: 'asset' })

    await expect(
      db
        .insert(chartOfAccounts)
        .values({ tenantId: tenant.id, code: '1000', name: 'Duplicate', type: 'asset' })
    ).rejects.toThrow()
  })

  it('links journal entry lines to a journal entry and an account', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)

    const [cash] = await db
      .insert(chartOfAccounts)
      .values({ tenantId: tenant.id, code: '1000', name: 'Cash', type: 'asset' })
      .returning()
    const [revenue] = await db
      .insert(chartOfAccounts)
      .values({ tenantId: tenant.id, code: '4000', name: 'Sales Revenue', type: 'revenue' })
      .returning()

    const [entry] = await db
      .insert(journalEntries)
      .values({
        tenantId: tenant.id,
        branchId: physicalBranch.id,
        entryNumber: 'JE-0001',
        entryDate: new Date(),
        sourceType: 'manual',
        status: 'draft',
      })
      .returning()

    // A balanced entry: debit cash, credit revenue, equal amounts — the
    // debit-total === credit-total invariant itself is enforced at the
    // application layer (not yet built), not by a DB constraint.
    await db.insert(journalEntryLines).values([
      { journalEntryId: entry.id, accountId: cash.id, debit: '100.00', credit: '0' },
      { journalEntryId: entry.id, accountId: revenue.id, debit: '0', credit: '100.00' },
    ])

    const lines = await db
      .select()
      .from(journalEntryLines)
      .where(eq(journalEntryLines.journalEntryId, entry.id))
    expect(lines).toHaveLength(2)
    const totalDebit = lines.reduce((sum, l) => sum + Number(l.debit), 0)
    const totalCredit = lines.reduce((sum, l) => sum + Number(l.credit), 0)
    expect(totalDebit).toBe(totalCredit)
  })
})

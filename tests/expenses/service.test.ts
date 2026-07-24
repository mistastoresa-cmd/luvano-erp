import { describe, it, expect } from 'vitest'
import { eq, and } from 'drizzle-orm'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { seedDefaultChartOfAccounts } from '@/lib/accounting/defaults'
import { createExpensesService } from '@/lib/expenses/service'
import { chartOfAccounts, bankAccounts, journalEntryLines, expenses } from '@/db/schema'
import { SYSTEM_CONTEXT } from '@/lib/authz/types'

async function setup() {
  const db = await createTestDb()
  const { tenant, physicalBranch } = await seedTenantWithBranch(db)
  await seedDefaultChartOfAccounts(db, tenant.id)

  // An expense account to charge, and a bank with its own chart account.
  const [rent] = await db
    .insert(chartOfAccounts)
    .values({ tenantId: tenant.id, code: '5300', name: 'إيجارات', type: 'expense' })
    .returning()
  const [bankChart] = await db
    .insert(chartOfAccounts)
    .values({ tenantId: tenant.id, code: '1010', name: 'بنك الراجحي', type: 'asset' })
    .returning()
  const [bank] = await db
    .insert(bankAccounts)
    .values({
      tenantId: tenant.id,
      bankName: 'الراجحي',
      accountNumber: '123456',
      chartAccountId: bankChart.id,
    })
    .returning()

  return { db, tenant, branch: physicalBranch, rent, bankChart, bank }
}

async function linesFor(
  db: Awaited<ReturnType<typeof createTestDb>>,
  journalEntryId: string
) {
  return db
    .select({
      accountId: journalEntryLines.accountId,
      debit: journalEntryLines.debit,
      credit: journalEntryLines.credit,
    })
    .from(journalEntryLines)
    .where(eq(journalEntryLines.journalEntryId, journalEntryId))
}

describe('ExpensesService', () => {
  it('posts a cash expense: debit the expense account, credit cash', async () => {
    const { db, tenant, branch, rent } = await setup()
    const svc = createExpensesService(db)

    const { expenseId } = await svc.createExpense(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      branchId: branch.id,
      expenseNumber: 'EXP-0001',
      expenseDate: '2026-07-20',
      expenseAccountId: rent.id,
      amount: 1000,
      paymentMethod: 'cash',
      description: 'إيجار يوليو',
    })
    const res = await svc.postExpenseJournal(SYSTEM_CONTEXT, tenant.id, expenseId)
    expect(res.status).toBe('accepted')

    const lines = await linesFor(db, res.journalEntryId)
    const debit = lines.find((l) => Number(l.debit) > 0)!
    expect(debit.accountId).toBe(rent.id)
    expect(Number(debit.debit)).toBe(1000)
    // Balanced: one credit of the same amount.
    expect(lines.reduce((s, l) => s + Number(l.credit), 0)).toBe(1000)

    const [row] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
    expect(row.status).toBe('posted')
    expect(row.journalEntryId).toBe(res.journalEntryId)
  })

  it('credits the specific bank account for a bank payment', async () => {
    const { db, tenant, rent, bankChart, bank } = await setup()
    const svc = createExpensesService(db)

    const { expenseId } = await svc.createExpense(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      expenseNumber: 'EXP-0002',
      expenseDate: '2026-07-21',
      expenseAccountId: rent.id,
      amount: 500,
      paymentMethod: 'bank',
      bankAccountId: bank.id,
    })
    const res = await svc.postExpenseJournal(SYSTEM_CONTEXT, tenant.id, expenseId)

    const lines = await linesFor(db, res.journalEntryId)
    const credit = lines.find((l) => Number(l.credit) > 0)!
    // The money leaves that bank's own chart account, not a generic cash one.
    expect(credit.accountId).toBe(bankChart.id)
    expect(Number(credit.credit)).toBe(500)
  })

  it('splits recoverable input VAT into its own debit line', async () => {
    const { db, tenant, rent } = await setup()
    const svc = createExpensesService(db)

    const { expenseId } = await svc.createExpense(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      expenseNumber: 'EXP-0003',
      expenseDate: '2026-07-22',
      expenseAccountId: rent.id,
      amount: 1000,
      taxAmount: 150,
      paymentMethod: 'cash',
    })
    const res = await svc.postExpenseJournal(SYSTEM_CONTEXT, tenant.id, expenseId)
    const lines = await linesFor(db, res.journalEntryId)

    // 1000 expense + 150 input tax debited, 1150 credited.
    expect(lines.reduce((s, l) => s + Number(l.debit), 0)).toBe(1150)
    expect(lines.reduce((s, l) => s + Number(l.credit), 0)).toBe(1150)
  })

  it('books a credit (on account) expense to accounts payable', async () => {
    const { db, tenant, rent } = await setup()
    const svc = createExpensesService(db)
    const [payable] = await db
      .select()
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.tenantId, tenant.id), eq(chartOfAccounts.code, '2000')))

    const { expenseId } = await svc.createExpense(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      expenseNumber: 'EXP-0004',
      expenseDate: '2026-07-23',
      expenseAccountId: rent.id,
      amount: 300,
      paymentMethod: 'credit',
    })
    const res = await svc.postExpenseJournal(SYSTEM_CONTEXT, tenant.id, expenseId)
    const lines = await linesFor(db, res.journalEntryId)
    const credit = lines.find((l) => Number(l.credit) > 0)!
    expect(credit.accountId).toBe(payable.id)
  })

  it('rejects a bank/cheque payment with no bank account', async () => {
    const { db, tenant, rent } = await setup()
    const svc = createExpensesService(db)
    await expect(
      svc.createExpense(SYSTEM_CONTEXT, {
        tenantId: tenant.id,
        expenseNumber: 'EXP-0005',
        expenseDate: '2026-07-24',
        expenseAccountId: rent.id,
        amount: 100,
        paymentMethod: 'cheque',
      })
    ).rejects.toThrow(/requires a bankAccountId/)
  })

  it('is idempotent — re-posting returns the same entry', async () => {
    const { db, tenant, rent } = await setup()
    const svc = createExpensesService(db)
    const { expenseId } = await svc.createExpense(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      expenseNumber: 'EXP-0006',
      expenseDate: '2026-07-25',
      expenseAccountId: rent.id,
      amount: 100,
      paymentMethod: 'cash',
    })
    const first = await svc.postExpenseJournal(SYSTEM_CONTEXT, tenant.id, expenseId)
    const second = await svc.postExpenseJournal(SYSTEM_CONTEXT, tenant.id, expenseId)
    expect(second.status).toBe('duplicate')
    expect(second.journalEntryId).toBe(first.journalEntryId)
  })
})

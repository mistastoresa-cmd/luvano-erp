import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { createHrService } from '@/lib/hr/service'
import { SYSTEM_CONTEXT } from '@/lib/authz/types'
import { chartOfAccounts, accountMappings, employees, journalEntryLines } from '@/db/schema'
import type { AccountMappingKey } from '@/lib/accounting/types'

async function seedPayrollAccountMappings(db: Awaited<ReturnType<typeof createTestDb>>, tenantId: string) {
  const keys: { key: AccountMappingKey; code: string; name: string; type: 'asset' | 'liability' | 'expense' }[] = [
    { key: 'salary_expense', code: '5100', name: 'Salary Expense', type: 'expense' },
    { key: 'salary_payable', code: '2200', name: 'Salary Payable', type: 'liability' },
  ]
  for (const k of keys) {
    const [account] = await db
      .insert(chartOfAccounts)
      .values({ tenantId, code: k.code, name: k.name, type: k.type })
      .returning()
    await db.insert(accountMappings).values({ tenantId, key: k.key, accountId: account.id })
  }
}

async function seedEmployee(
  db: Awaited<ReturnType<typeof createTestDb>>,
  tenantId: string,
  overrides: Partial<{ name: string; baseSalary: string; status: 'active' | 'on_leave' | 'terminated' }> = {}
) {
  const [employee] = await db
    .insert(employees)
    .values({
      tenantId,
      employeeNumber: `EMP-TEST-${crypto.randomUUID()}`,
      name: overrides.name ?? 'Mohammed Al-Otaibi',
      hireDate: '2025-01-01',
      baseSalary: overrides.baseSalary ?? '5000.00',
      status: overrides.status ?? 'active',
    })
    .returning()
  return employee
}

describe('HrService.processPayrollRun', () => {
  it('snapshots active employees into payroll_entries with computed netPay', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const hr = createHrService(db)
    const employee = await seedEmployee(db, tenant.id, { baseSalary: '6000.00' })

    const run = await hr.createPayrollRun(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    })

    const result = await hr.processPayrollRun(SYSTEM_CONTEXT, tenant.id, run.id, [
      { employeeId: employee.id, allowances: 500, deductions: 200 },
    ])

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].baseSalary).toBe(6000)
    expect(result.entries[0].netPay).toBe(6300) // 6000 + 500 - 200
  })

  it('excludes non-active employees from the run', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const hr = createHrService(db)
    await seedEmployee(db, tenant.id, { name: 'Active Emp' })
    await seedEmployee(db, tenant.id, { name: 'Terminated Emp', status: 'terminated' })

    const run = await hr.createPayrollRun(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    })
    const result = await hr.processPayrollRun(SYSTEM_CONTEXT, tenant.id, run.id)

    expect(result.entries).toHaveLength(1)
  })

  it('rejects reprocessing an already-processed run', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const hr = createHrService(db)
    await seedEmployee(db, tenant.id)

    const run = await hr.createPayrollRun(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    })
    await hr.processPayrollRun(SYSTEM_CONTEXT, tenant.id, run.id)

    await expect(hr.processPayrollRun(SYSTEM_CONTEXT, tenant.id, run.id)).rejects.toThrow('already processed')
  })
})

describe('HrService.postPayrollJournal', () => {
  it('posts a balanced debit-salary_expense/credit-salary_payable entry sized from the run total', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    await seedPayrollAccountMappings(db, tenant.id)
    const hr = createHrService(db)
    const employee1 = await seedEmployee(db, tenant.id, { name: 'Emp 1', baseSalary: '4000.00' })
    const employee2 = await seedEmployee(db, tenant.id, { name: 'Emp 2', baseSalary: '3000.00' })

    const run = await hr.createPayrollRun(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    })
    await hr.processPayrollRun(SYSTEM_CONTEXT, tenant.id, run.id)

    const result = await hr.postPayrollJournal(SYSTEM_CONTEXT, tenant.id, run.id)
    expect(result.status).toBe('accepted')
    expect(result.totalNetPay).toBe(7000)

    const lines = await db
      .select()
      .from(journalEntryLines)
      .where(eq(journalEntryLines.journalEntryId, result.journalEntryId))
    expect(lines).toHaveLength(2)
    const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0)
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0)
    expect(totalDebit).toBe(7000)
    expect(totalCredit).toBe(7000)
    void employee1
    void employee2
  })

  it('is idempotent — re-posting the same run does not create a second journal entry', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    await seedPayrollAccountMappings(db, tenant.id)
    const hr = createHrService(db)
    await seedEmployee(db, tenant.id, { baseSalary: '5000.00' })

    const run = await hr.createPayrollRun(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    })
    await hr.processPayrollRun(SYSTEM_CONTEXT, tenant.id, run.id)

    const first = await hr.postPayrollJournal(SYSTEM_CONTEXT, tenant.id, run.id)
    const second = await hr.postPayrollJournal(SYSTEM_CONTEXT, tenant.id, run.id)

    expect(first.status).toBe('accepted')
    expect(second.status).toBe('duplicate')
    expect(second.journalEntryId).toBe(first.journalEntryId)
  })

  it('rejects posting a run that has not been processed yet', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    await seedPayrollAccountMappings(db, tenant.id)
    const hr = createHrService(db)

    const run = await hr.createPayrollRun(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    })

    await expect(hr.postPayrollJournal(SYSTEM_CONTEXT, tenant.id, run.id)).rejects.toThrow('no entries to post')
  })
})

describe('HrService — RBAC', () => {
  it('rejects branch_manager creating a payroll run (payroll is confidential owner/accountant data)', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const hr = createHrService(db)
    const branchManager = { userId: 'user-1', role: 'branch_manager' as const, branchAccess: { type: 'all' as const } }

    await expect(
      hr.createPayrollRun(branchManager, { tenantId: tenant.id, periodStart: '2026-07-01', periodEnd: '2026-07-31' })
    ).rejects.toThrow('role "branch_manager"')
  })
})

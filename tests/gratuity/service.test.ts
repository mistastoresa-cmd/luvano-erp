import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { createEmployeesService } from '@/lib/employees/service'
import { SYSTEM_CONTEXT } from '@/lib/authz/types'
import { createGratuityService } from '@/lib/gratuity/service'
import { chartOfAccounts, accountMappings, journalEntryLines } from '@/db/schema'
import type { AccountMappingKey } from '@/lib/accounting/types'

async function seedGratuityAccountMappings(db: Awaited<ReturnType<typeof createTestDb>>, tenantId: string) {
  const keys: { key: AccountMappingKey; code: string; name: string; type: 'expense' | 'liability' }[] = [
    { key: 'gratuity_expense', code: '5200', name: 'Gratuity Expense', type: 'expense' },
    { key: 'gratuity_payable', code: '2300', name: 'Gratuity Payable', type: 'liability' },
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
  hireDate: string,
  baseSalary = 6000
) {
  const employees = createEmployeesService(db)
  return employees.createEmployee(SYSTEM_CONTEXT, { tenantId, name: 'Test Employee', hireDate, baseSalary })
}

describe('GratuityService.previewEndOfServiceGratuity', () => {
  it('computes full gratuity for employer termination past 5 years (half-month x5 + full-month beyond)', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employee = await seedEmployee(db, tenant.id, '2016-01-01', 6000) // ~10 years by 2026-01-01
    const gratuity = createGratuityService(db)

    const result = await gratuity.previewEndOfServiceGratuity(
      SYSTEM_CONTEXT,
      tenant.id,
      employee.id,
      '2026-01-01',
      'employer_termination'
    )

    expect(result.yearsOfService).toBeCloseTo(10, 0)
    // gross = 5*0.5*6000 + 5*6000 = 15000 + 30000 = 45000
    expect(result.grossAmount).toBeCloseTo(45000, -1)
    expect(result.applicablePercent).toBe(100)
    expect(result.netAmount).toBeCloseTo(45000, -1)
  })

  it('zeroes out gratuity on resignation before 2 years of service', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employee = await seedEmployee(db, tenant.id, '2025-01-01', 6000) // ~1 year
    const gratuity = createGratuityService(db)

    const result = await gratuity.previewEndOfServiceGratuity(
      SYSTEM_CONTEXT,
      tenant.id, employee.id, '2026-01-01', 'resignation')
    expect(result.applicablePercent).toBe(0)
    expect(result.netAmount).toBe(0)
  })

  it('applies the 1/3 reduction on resignation between 2 and 5 years of service', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employee = await seedEmployee(db, tenant.id, '2023-01-01', 6000) // ~3 years
    const gratuity = createGratuityService(db)

    const result = await gratuity.previewEndOfServiceGratuity(
      SYSTEM_CONTEXT,
      tenant.id, employee.id, '2026-01-01', 'resignation')
    expect(result.applicablePercent).toBeCloseTo(33.33, 1)
  })

  it('applies the 2/3 reduction on resignation between 5 and 10 years of service', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employee = await seedEmployee(db, tenant.id, '2019-01-01', 6000) // ~7 years
    const gratuity = createGratuityService(db)

    const result = await gratuity.previewEndOfServiceGratuity(
      SYSTEM_CONTEXT,
      tenant.id, employee.id, '2026-01-01', 'resignation')
    expect(result.applicablePercent).toBeCloseTo(66.67, 1)
  })
})

describe('GratuityService.terminateEmployee', () => {
  it('writes a gratuity_payments row, marks the employee terminated, and posts a balanced journal entry', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    await seedGratuityAccountMappings(db, tenant.id)
    const employee = await seedEmployee(db, tenant.id, '2016-01-01', 6000)
    const employees = createEmployeesService(db)
    const gratuity = createGratuityService(db)

    const result = await gratuity.terminateEmployee(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      employeeId: employee.id,
      terminationDate: '2026-01-01',
      terminationReason: 'employer_termination',
    })

    expect(result.journalEntryId).toBeTruthy()

    const updated = await employees.getEmployee(SYSTEM_CONTEXT, tenant.id, employee.id)
    expect(updated?.status).toBe('terminated')
    expect(updated?.terminationReason).toBe('employer_termination')

    const lines = await db
      .select()
      .from(journalEntryLines)
      .where(eq(journalEntryLines.journalEntryId, result.journalEntryId!))
    const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0)
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0)
    expect(totalDebit).toBeCloseTo(totalCredit, 2)
  })

  it('rejects terminating an already-terminated employee', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    await seedGratuityAccountMappings(db, tenant.id)
    const employee = await seedEmployee(db, tenant.id, '2016-01-01', 6000)
    const gratuity = createGratuityService(db)

    await gratuity.terminateEmployee(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      employeeId: employee.id,
      terminationDate: '2026-01-01',
      terminationReason: 'employer_termination',
    })

    await expect(
      gratuity.terminateEmployee(SYSTEM_CONTEXT, {
        tenantId: tenant.id,
        employeeId: employee.id,
        terminationDate: '2026-02-01',
        terminationReason: 'resignation',
      })
    ).rejects.toThrow('already terminated')
  })

  it('does not post a journal entry when the net gratuity is zero (early resignation)', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    await seedGratuityAccountMappings(db, tenant.id)
    const employee = await seedEmployee(db, tenant.id, '2025-06-01', 6000) // <1 year
    const employees = createEmployeesService(db)
    const gratuity = createGratuityService(db)

    const result = await gratuity.terminateEmployee(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      employeeId: employee.id,
      terminationDate: '2026-01-01',
      terminationReason: 'resignation',
    })

    expect(result.netAmount).toBe(0)
    expect(result.journalEntryId).toBeNull()

    const updated = await employees.getEmployee(SYSTEM_CONTEXT, tenant.id, employee.id)
    expect(updated?.status).toBe('terminated')
  })
})

describe('GratuityService — RBAC', () => {
  it('rejects a branch_manager terminating an employee (gratuity is owner/accountant-only confidential data)', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    await seedGratuityAccountMappings(db, tenant.id)
    const employee = await seedEmployee(db, tenant.id, '2016-01-01', 6000)
    const gratuity = createGratuityService(db)
    const branchManager = { userId: 'user-1', role: 'branch_manager' as const, branchAccess: { type: 'all' as const } }

    await expect(
      gratuity.terminateEmployee(branchManager, {
        tenantId: tenant.id,
        employeeId: employee.id,
        terminationDate: '2026-01-01',
        terminationReason: 'employer_termination',
      })
    ).rejects.toThrow('role "branch_manager"')
  })
})

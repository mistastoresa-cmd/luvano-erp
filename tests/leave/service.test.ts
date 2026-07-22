import { describe, it, expect } from 'vitest'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { createEmployeesService } from '@/lib/employees/service'
import { SYSTEM_CONTEXT } from '@/lib/authz/types'
import { createLeaveService } from '@/lib/leave/service'

async function seedEmployee(
  db: Awaited<ReturnType<typeof createTestDb>>,
  tenantId: string,
  hireDate: string
) {
  const employees = createEmployeesService(db)
  return employees.createEmployee(SYSTEM_CONTEXT, { tenantId, name: 'Test Employee', hireDate, baseSalary: 5000 })
}

describe('LeaveService.getAnnualLeaveBalance', () => {
  it('entitles 21 days/year before 5 years of service', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employee = await seedEmployee(db, tenant.id, '2023-01-01')
    const leave = createLeaveService(db)

    const balance = await leave.getAnnualLeaveBalance(SYSTEM_CONTEXT, tenant.id, employee.id, 2026)
    expect(balance.entitlementDays).toBe(21)
  })

  it('entitles 30 days/year once 5 years of service are completed', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employee = await seedEmployee(db, tenant.id, '2018-01-01')
    const leave = createLeaveService(db)

    const balance = await leave.getAnnualLeaveBalance(SYSTEM_CONTEXT, tenant.id, employee.id, 2026)
    expect(balance.entitlementDays).toBe(30)
  })

  it('subtracts approved annual leave from the entitlement, ignores pending/rejected', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employee = await seedEmployee(db, tenant.id, '2023-01-01')
    const leave = createLeaveService(db)

    const approved = await leave.createLeaveRequest(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      employeeId: employee.id,
      leaveType: 'annual',
      startDate: '2026-03-01',
      endDate: '2026-03-05', // 5 days
    })
    await leave.approveLeaveRequest(SYSTEM_CONTEXT, tenant.id, approved.id)

    const pending = await leave.createLeaveRequest(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      employeeId: employee.id,
      leaveType: 'annual',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
    })
    void pending // left pending — must not count against the balance

    const balance = await leave.getAnnualLeaveBalance(SYSTEM_CONTEXT, tenant.id, employee.id, 2026)
    expect(balance.usedDays).toBe(5)
    expect(balance.remainingDays).toBe(16)
  })
})

describe('LeaveService.createLeaveRequest', () => {
  it('rejects an annual leave request that exceeds the remaining balance', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employee = await seedEmployee(db, tenant.id, '2023-01-01')
    const leave = createLeaveService(db)

    await expect(
      leave.createLeaveRequest(SYSTEM_CONTEXT, {
        tenantId: tenant.id,
        employeeId: employee.id,
        leaveType: 'annual',
        startDate: '2026-01-01',
        endDate: '2026-01-25', // 25 days > 21 entitlement
      })
    ).rejects.toThrow('exceeds remaining balance')
  })

  it('grades sick leave pay tier full -> three_quarters -> unpaid as prior approved sick days accumulate', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employee = await seedEmployee(db, tenant.id, '2023-01-01')
    const leave = createLeaveService(db)

    // First 25 days: still under the 30-day full-pay threshold.
    const first = await leave.createLeaveRequest(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      employeeId: employee.id,
      leaveType: 'sick',
      startDate: '2026-01-01',
      endDate: '2026-01-25', // 25 days
    })
    expect(first.sickPayTier).toBe('full')
    await leave.approveLeaveRequest(SYSTEM_CONTEXT, tenant.id, first.id)

    // Next request starts after 25 prior approved days — still under 30.
    const second = await leave.createLeaveRequest(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      employeeId: employee.id,
      leaveType: 'sick',
      startDate: '2026-02-01',
      endDate: '2026-02-10', // 10 days, prior=25 -> still 'full' tier at start
    })
    expect(second.sickPayTier).toBe('full')
    await leave.approveLeaveRequest(SYSTEM_CONTEXT, tenant.id, second.id)

    // Now prior approved = 35 days (>30) -> three_quarters tier.
    const third = await leave.createLeaveRequest(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      employeeId: employee.id,
      leaveType: 'sick',
      startDate: '2026-03-01',
      endDate: '2026-03-05',
    })
    expect(third.sickPayTier).toBe('three_quarters')
  })

  it('computes dayCount inclusive of both start and end dates', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employee = await seedEmployee(db, tenant.id, '2023-01-01')
    const leave = createLeaveService(db)

    const request = await leave.createLeaveRequest(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      employeeId: employee.id,
      leaveType: 'unpaid',
      startDate: '2026-04-01',
      endDate: '2026-04-01',
    })
    expect(request.dayCount).toBe(1)
  })
})

describe('LeaveService.approveLeaveRequest / rejectLeaveRequest', () => {
  it('rejects approving a request that is not pending', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employee = await seedEmployee(db, tenant.id, '2023-01-01')
    const leave = createLeaveService(db)

    const request = await leave.createLeaveRequest(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      employeeId: employee.id,
      leaveType: 'annual',
      startDate: '2026-01-01',
      endDate: '2026-01-02',
    })
    await leave.approveLeaveRequest(SYSTEM_CONTEXT, tenant.id, request.id)

    await expect(leave.approveLeaveRequest(SYSTEM_CONTEXT, tenant.id, request.id)).rejects.toThrow('not found or not pending')
  })

  it('rejectLeaveRequest flips status to rejected', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employee = await seedEmployee(db, tenant.id, '2023-01-01')
    const leave = createLeaveService(db)

    const request = await leave.createLeaveRequest(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      employeeId: employee.id,
      leaveType: 'annual',
      startDate: '2026-01-01',
      endDate: '2026-01-02',
    })
    const rejected = await leave.rejectLeaveRequest(SYSTEM_CONTEXT, tenant.id, request.id)
    expect(rejected.status).toBe('rejected')
  })
})

describe('LeaveService — RBAC', () => {
  it('rejects staff creating a leave request (HR administration is owner/accountant/branch_manager only)', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employee = await seedEmployee(db, tenant.id, '2023-01-01')
    const leave = createLeaveService(db)
    const staff = { userId: 'user-1', role: 'staff' as const, branchAccess: { type: 'all' as const } }

    await expect(
      leave.createLeaveRequest(staff, {
        tenantId: tenant.id,
        employeeId: employee.id,
        leaveType: 'annual',
        startDate: '2026-01-01',
        endDate: '2026-01-02',
      })
    ).rejects.toThrow('role "staff"')
  })
})

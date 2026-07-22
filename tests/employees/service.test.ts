import { describe, it, expect } from 'vitest'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { createEmployeesService } from '@/lib/employees/service'
import { SYSTEM_CONTEXT } from '@/lib/authz/types'

describe('EmployeesService.createEmployee', () => {
  it('allocates sequential employee numbers starting at EMP-0001', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employees = createEmployeesService(db)

    const first = await employees.createEmployee(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      name: 'Ahmed Ali',
      hireDate: '2020-01-01',
      baseSalary: 5000,
    })
    const second = await employees.createEmployee(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      name: 'Sara Mohammed',
      hireDate: '2021-01-01',
      baseSalary: 6000,
    })

    expect(first.employeeNumber).toBe('EMP-0001')
    expect(second.employeeNumber).toBe('EMP-0002')
  })

  it('keeps employee number sequences independent per tenant', async () => {
    const db = await createTestDb()
    const { tenant: tenantA } = await seedTenantWithBranch(db)
    const { tenant: tenantB } = await seedTenantWithBranch(db)
    const employees = createEmployeesService(db)

    const empA = await employees.createEmployee(SYSTEM_CONTEXT, {
      tenantId: tenantA.id,
      name: 'Employee A',
      hireDate: '2020-01-01',
      baseSalary: 5000,
    })
    const empB = await employees.createEmployee(SYSTEM_CONTEXT, {
      tenantId: tenantB.id,
      name: 'Employee B',
      hireDate: '2020-01-01',
      baseSalary: 5000,
    })

    expect(empA.employeeNumber).toBe('EMP-0001')
    expect(empB.employeeNumber).toBe('EMP-0001')
  })

  it('stores the full personal and professional registration fields', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    const employees = createEmployeesService(db)

    const employee = await employees.createEmployee(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      branchId: physicalBranch.id,
      name: 'Khalid Al-Harbi',
      phone: '0501234567',
      email: 'khalid@example.com',
      nationalId: '1234567890',
      idType: 'national_id',
      nationality: 'Saudi',
      jobTitle: 'Sales Associate',
      department: 'Retail',
      hireDate: '2022-06-01',
      baseSalary: 4500,
      contractType: 'unlimited',
      gosiNumber: 'GOSI-1',
      ibanNumber: 'SA0000000000000000000000',
    })

    expect(employee.jobTitle).toBe('Sales Associate')
    expect(employee.department).toBe('Retail')
    expect(employee.nationality).toBe('Saudi')
    expect(employee.contractType).toBe('unlimited')
    expect(employee.status).toBe('active')
  })
})

describe('EmployeesService — CRUD scoping', () => {
  it('gets and lists employees scoped to tenant only', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const { tenant: otherTenant } = await seedTenantWithBranch(db)
    const employees = createEmployeesService(db)

    const employee = await employees.createEmployee(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      name: 'Ahmed Ali',
      hireDate: '2020-01-01',
      baseSalary: 5000,
    })
    await employees.createEmployee(SYSTEM_CONTEXT, {
      tenantId: otherTenant.id,
      name: 'Other Tenant Employee',
      hireDate: '2020-01-01',
      baseSalary: 5000,
    })

    expect(await employees.getEmployee(SYSTEM_CONTEXT, tenant.id, employee.id)).not.toBeNull()
    expect(await employees.getEmployee(SYSTEM_CONTEXT, otherTenant.id, employee.id)).toBeNull()
    expect(await employees.listEmployees(SYSTEM_CONTEXT, tenant.id)).toHaveLength(1)
  })

  it('updates an employee scoped to tenant, throws on cross-tenant update', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const { tenant: otherTenant } = await seedTenantWithBranch(db)
    const employees = createEmployeesService(db)

    const employee = await employees.createEmployee(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      name: 'Ahmed Ali',
      hireDate: '2020-01-01',
      baseSalary: 5000,
    })

    const updated = await employees.updateEmployee(SYSTEM_CONTEXT, tenant.id, employee.id, { jobTitle: 'Manager' })
    expect(updated.jobTitle).toBe('Manager')

    await expect(
      employees.updateEmployee(SYSTEM_CONTEXT, otherTenant.id, employee.id, { jobTitle: 'Hijacked' })
    ).rejects.toThrow('Employee not found')
  })
})

describe('EmployeesService — RBAC', () => {
  it('rejects staff registering an employee (PII/salary data is not routine staff visibility)', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employees = createEmployeesService(db)
    const staff = { userId: 'user-1', role: 'staff' as const, branchAccess: { type: 'all' as const } }

    await expect(
      employees.createEmployee(staff, { tenantId: tenant.id, name: 'Staff-Registered Employee', hireDate: '2026-01-01', baseSalary: 4000 })
    ).rejects.toThrow('role "staff"')
  })

  it('rejects a branch_manager registering an employee at a branch outside their access', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)
    const employees = createEmployeesService(db)
    const outsider = {
      userId: 'user-1',
      role: 'branch_manager' as const,
      branchAccess: { type: 'list' as const, branchIds: ['some-other-branch'] },
    }

    await expect(
      employees.createEmployee(outsider, {
        tenantId: tenant.id,
        branchId: physicalBranch.id,
        name: 'Employee',
        hireDate: '2026-01-01',
        baseSalary: 4000,
      })
    ).rejects.toThrow('no access to branch')
  })
})

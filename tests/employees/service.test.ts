import { describe, it, expect } from 'vitest'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { createEmployeesService } from '@/lib/employees/service'

describe('EmployeesService.createEmployee', () => {
  it('allocates sequential employee numbers starting at EMP-0001', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employees = createEmployeesService(db)

    const first = await employees.createEmployee({
      tenantId: tenant.id,
      name: 'Ahmed Ali',
      hireDate: '2020-01-01',
      baseSalary: 5000,
    })
    const second = await employees.createEmployee({
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

    const empA = await employees.createEmployee({
      tenantId: tenantA.id,
      name: 'Employee A',
      hireDate: '2020-01-01',
      baseSalary: 5000,
    })
    const empB = await employees.createEmployee({
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

    const employee = await employees.createEmployee({
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

    const employee = await employees.createEmployee({
      tenantId: tenant.id,
      name: 'Ahmed Ali',
      hireDate: '2020-01-01',
      baseSalary: 5000,
    })
    await employees.createEmployee({
      tenantId: otherTenant.id,
      name: 'Other Tenant Employee',
      hireDate: '2020-01-01',
      baseSalary: 5000,
    })

    expect(await employees.getEmployee(tenant.id, employee.id)).not.toBeNull()
    expect(await employees.getEmployee(otherTenant.id, employee.id)).toBeNull()
    expect(await employees.listEmployees(tenant.id)).toHaveLength(1)
  })

  it('updates an employee scoped to tenant, throws on cross-tenant update', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const { tenant: otherTenant } = await seedTenantWithBranch(db)
    const employees = createEmployeesService(db)

    const employee = await employees.createEmployee({
      tenantId: tenant.id,
      name: 'Ahmed Ali',
      hireDate: '2020-01-01',
      baseSalary: 5000,
    })

    const updated = await employees.updateEmployee(tenant.id, employee.id, { jobTitle: 'Manager' })
    expect(updated.jobTitle).toBe('Manager')

    await expect(
      employees.updateEmployee(otherTenant.id, employee.id, { jobTitle: 'Hijacked' })
    ).rejects.toThrow('Employee not found')
  })
})

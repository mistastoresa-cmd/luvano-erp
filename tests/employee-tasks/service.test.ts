import { describe, it, expect } from 'vitest'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { createEmployeesService } from '@/lib/employees/service'
import { SYSTEM_CONTEXT } from '@/lib/authz/types'
import { createTasksService } from '@/lib/employee-tasks/service'

async function seedEmployee(db: Awaited<ReturnType<typeof createTestDb>>, tenantId: string) {
  const employees = createEmployeesService(db)
  return employees.createEmployee(SYSTEM_CONTEXT, { tenantId, name: 'Test Employee', hireDate: '2023-01-01', baseSalary: 5000 })
}

describe('TasksService', () => {
  it('assigns a task and lists it for the employee, newest first', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employee = await seedEmployee(db, tenant.id)
    const tasks = createTasksService(db)

    await tasks.assignTask(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      employeeId: employee.id,
      title: 'جرد المخزون الأسبوعي',
      assignedBy: 'Branch Manager',
    })
    await tasks.assignTask(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      employeeId: employee.id,
      title: 'تنظيف الواجهة',
    })

    const list = await tasks.listEmployeeTasks(SYSTEM_CONTEXT, tenant.id, employee.id)
    expect(list).toHaveLength(2)
    expect(list[0].title).toBe('تنظيف الواجهة')
  })

  it('scopes tasks to the given employee only', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employeeA = await seedEmployee(db, tenant.id)
    const employeeB = await seedEmployee(db, tenant.id)
    const tasks = createTasksService(db)

    await tasks.assignTask(SYSTEM_CONTEXT, { tenantId: tenant.id, employeeId: employeeA.id, title: 'Task A' })
    await tasks.assignTask(SYSTEM_CONTEXT, { tenantId: tenant.id, employeeId: employeeB.id, title: 'Task B' })

    const listA = await tasks.listEmployeeTasks(SYSTEM_CONTEXT, tenant.id, employeeA.id)
    expect(listA).toHaveLength(1)
    expect(listA[0].title).toBe('Task A')
  })

  it('updates task status', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employee = await seedEmployee(db, tenant.id)
    const tasks = createTasksService(db)

    const task = await tasks.assignTask(SYSTEM_CONTEXT, { tenantId: tenant.id, employeeId: employee.id, title: 'Task' })
    const updated = await tasks.updateTaskStatus(SYSTEM_CONTEXT, tenant.id, task.id, 'done')
    expect(updated.status).toBe('done')
  })
})

describe('TasksService — RBAC', () => {
  it('rejects staff assigning a task (task management is owner/accountant/branch_manager only)', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employee = await seedEmployee(db, tenant.id)
    const tasks = createTasksService(db)
    const staff = { userId: 'user-1', role: 'staff' as const, branchAccess: { type: 'all' as const } }

    await expect(
      tasks.assignTask(staff, { tenantId: tenant.id, employeeId: employee.id, title: 'Task' })
    ).rejects.toThrow('role "staff"')
  })
})

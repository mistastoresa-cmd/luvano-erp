import { describe, it, expect } from 'vitest'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { createEmployeesService } from '@/lib/employees/service'
import { createNotificationsService } from '@/lib/hr-notifications/service'

async function seedEmployee(db: Awaited<ReturnType<typeof createTestDb>>, tenantId: string) {
  const employees = createEmployeesService(db)
  return employees.createEmployee({ tenantId, name: 'Test Employee', hireDate: '2023-01-01', baseSalary: 5000 })
}

describe('NotificationsService', () => {
  it('issues a warning letter and lists it for the employee, newest first', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employee = await seedEmployee(db, tenant.id)
    const notifications = createNotificationsService(db)

    await notifications.issueNotification({
      tenantId: tenant.id,
      employeeId: employee.id,
      type: 'notice',
      subject: 'إشعار عام',
      body: 'محتوى الإشعار',
    })
    await notifications.issueNotification({
      tenantId: tenant.id,
      employeeId: employee.id,
      type: 'warning',
      subject: 'إنذار تأخر عن الدوام',
      body: 'تم رصد تأخرك عن الدوام ثلاث مرات هذا الشهر',
      issuedBy: 'HR Manager',
    })

    const list = await notifications.listEmployeeNotifications(tenant.id, employee.id)
    expect(list).toHaveLength(2)
    expect(list[0].type).toBe('warning') // most recent first
    expect(list[0].status).toBe('sent')
  })

  it('stores relatedAmount for a deduction notification', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employee = await seedEmployee(db, tenant.id)
    const notifications = createNotificationsService(db)

    const notification = await notifications.issueNotification({
      tenantId: tenant.id,
      employeeId: employee.id,
      type: 'deduction',
      subject: 'خصم غياب',
      body: 'خصم يوم غياب بدون إذن',
      relatedAmount: 150,
    })

    expect(notification.relatedAmount).toBe(150)
  })

  it('acknowledges a notification and rejects acknowledging it twice', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const employee = await seedEmployee(db, tenant.id)
    const notifications = createNotificationsService(db)

    const notification = await notifications.issueNotification({
      tenantId: tenant.id,
      employeeId: employee.id,
      type: 'commendation',
      subject: 'تنويه شكر',
      body: 'شكراً لجهودك المتميزة',
    })

    const acknowledged = await notifications.acknowledgeNotification(tenant.id, notification.id)
    expect(acknowledged.status).toBe('acknowledged')
    expect(acknowledged.acknowledgedAt).not.toBeNull()

    await expect(notifications.acknowledgeNotification(tenant.id, notification.id)).rejects.toThrow(
      'not found or already acknowledged'
    )
  })
})

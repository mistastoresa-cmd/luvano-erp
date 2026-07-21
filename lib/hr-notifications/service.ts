import { eq, and, desc } from 'drizzle-orm'
import { employeeNotifications } from '@/db/schema'
import type { Db } from '@/db/client'
import type { NotificationsService, IssueNotificationInput, EmployeeNotification } from './types'

function toNotification(row: typeof employeeNotifications.$inferSelect): EmployeeNotification {
  return {
    id: row.id,
    tenantId: row.tenantId,
    employeeId: row.employeeId,
    type: row.type,
    subject: row.subject,
    body: row.body,
    relatedAmount: row.relatedAmount !== null ? Number(row.relatedAmount) : null,
    issuedBy: row.issuedBy,
    issuedAt: row.issuedAt,
    acknowledgedAt: row.acknowledgedAt,
    status: row.status,
  }
}

export function createNotificationsService(db: Db): NotificationsService {
  return {
    async issueNotification(input: IssueNotificationInput): Promise<EmployeeNotification> {
      const [row] = await db
        .insert(employeeNotifications)
        .values({
          tenantId: input.tenantId,
          employeeId: input.employeeId,
          type: input.type,
          subject: input.subject,
          body: input.body,
          relatedAmount: input.relatedAmount !== undefined ? input.relatedAmount.toFixed(2) : undefined,
          issuedBy: input.issuedBy,
        })
        .returning()
      return toNotification(row)
    },

    async listEmployeeNotifications(tenantId: string, employeeId: string): Promise<EmployeeNotification[]> {
      const rows = await db
        .select()
        .from(employeeNotifications)
        .where(
          and(eq(employeeNotifications.tenantId, tenantId), eq(employeeNotifications.employeeId, employeeId))
        )
        .orderBy(desc(employeeNotifications.issuedAt))
      return rows.map(toNotification)
    },

    async acknowledgeNotification(tenantId: string, notificationId: string): Promise<EmployeeNotification> {
      const [row] = await db
        .update(employeeNotifications)
        .set({ status: 'acknowledged', acknowledgedAt: new Date() })
        .where(
          and(
            eq(employeeNotifications.tenantId, tenantId),
            eq(employeeNotifications.id, notificationId),
            eq(employeeNotifications.status, 'sent')
          )
        )
        .returning()
      if (!row) throw new Error(`employee_notification ${notificationId} not found or already acknowledged`)
      return toNotification(row)
    },
  }
}

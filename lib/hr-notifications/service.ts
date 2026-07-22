import { eq, and, desc } from 'drizzle-orm'
import { employeeNotifications } from '@/db/schema'
import type { Db } from '@/db/client'
import { assertRoleAudited } from '../authz/service'
import type { CallerContext } from '../authz/types'
import type { NotificationsService, IssueNotificationInput, EmployeeNotification } from './types'

const NOTIFICATION_ROLES = ['owner', 'accountant', 'branch_manager'] as const

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
    async issueNotification(
      context: CallerContext,
      input: IssueNotificationInput
    ): Promise<EmployeeNotification> {
      assertRoleAudited(db, input.tenantId, context, [...NOTIFICATION_ROLES])
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

    async listEmployeeNotifications(
      context: CallerContext,
      tenantId: string,
      employeeId: string
    ): Promise<EmployeeNotification[]> {
      assertRoleAudited(db, tenantId, context, [...NOTIFICATION_ROLES])
      const rows = await db
        .select()
        .from(employeeNotifications)
        .where(
          and(eq(employeeNotifications.tenantId, tenantId), eq(employeeNotifications.employeeId, employeeId))
        )
        .orderBy(desc(employeeNotifications.issuedAt))
      return rows.map(toNotification)
    },

    async acknowledgeNotification(
      context: CallerContext,
      tenantId: string,
      notificationId: string
    ): Promise<EmployeeNotification> {
      assertRoleAudited(db, tenantId, context, [...NOTIFICATION_ROLES])
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

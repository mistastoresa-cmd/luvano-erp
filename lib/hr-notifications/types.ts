import type { CallerContext } from '../authz/types'

export type NotificationType = 'warning' | 'commendation' | 'notice' | 'deduction' | 'other'
export type NotificationStatus = 'sent' | 'acknowledged'

export interface IssueNotificationInput {
  tenantId: string
  employeeId: string
  type: NotificationType
  subject: string
  body: string
  // Only meaningful for type='deduction'. Not applied to payroll
  // automatically — see EmployeePayrollAdjustment in lib/hr/types.ts, the
  // manual bridge point into processPayrollRun.
  relatedAmount?: number
  issuedBy?: string
}

export interface EmployeeNotification {
  id: string
  tenantId: string
  employeeId: string
  type: NotificationType
  subject: string
  body: string
  relatedAmount: number | null
  issuedBy: string | null
  issuedAt: Date
  acknowledgedAt: Date | null
  status: NotificationStatus
}

// Issuing official correspondence is owner/accountant/branch_manager only.
// acknowledgeNotification is conceptually the employee's own action, but
// self-service isn't wired yet (see docs/ARCHITECTURE.md) — for now it's
// recorded by the same HR-admin roles on the employee's behalf.
export interface NotificationsService {
  // Records an official letter/notice — warning (إنذار), commendation
  // (تنويه), general notice, or deduction — addressed to the employee.
  issueNotification(context: CallerContext, input: IssueNotificationInput): Promise<EmployeeNotification>
  listEmployeeNotifications(
    context: CallerContext,
    tenantId: string,
    employeeId: string
  ): Promise<EmployeeNotification[]>
  // Employee confirms receipt — standard HR practice for official
  // correspondence, especially warnings ahead of any later disciplinary
  // action. Throws if the notification is already acknowledged (not
  // silently re-acknowledgeable).
  acknowledgeNotification(
    context: CallerContext,
    tenantId: string,
    notificationId: string
  ): Promise<EmployeeNotification>
}

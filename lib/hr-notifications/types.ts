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

export interface NotificationsService {
  // Records an official letter/notice — warning (إنذار), commendation
  // (تنويه), general notice, or deduction — addressed to the employee.
  issueNotification(input: IssueNotificationInput): Promise<EmployeeNotification>
  listEmployeeNotifications(tenantId: string, employeeId: string): Promise<EmployeeNotification[]>
  // Employee confirms receipt — standard HR practice for official
  // correspondence, especially warnings ahead of any later disciplinary
  // action. Throws if the notification is already acknowledged (not
  // silently re-acknowledgeable).
  acknowledgeNotification(tenantId: string, notificationId: string): Promise<EmployeeNotification>
}

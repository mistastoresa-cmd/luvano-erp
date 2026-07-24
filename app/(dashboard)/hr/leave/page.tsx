import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq, desc } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { leaveRequests, employees } from '@/db/schema'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/app-shell/page-header'
import { AddResourceDialog } from '@/components/forms/resource-form'
import { HrTabs } from '../hr-tabs'
import { createLeaveAction } from './actions'
import { LeaveDecisionButtons } from './leave-buttons'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from '@/components/ui/table'

const TYPE_LABELS: Record<string, string> = {
  annual: 'سنوية',
  sick: 'مرضية',
  unpaid: 'بدون راتب',
  maternity: 'وضع',
  other: 'أخرى',
}
const STATUS_LABELS: Record<string, string> = {
  pending: 'بانتظار الاعتماد',
  approved: 'معتمدة',
  rejected: 'مرفوضة',
}
const STATUS_TONE: Record<string, 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
}

function fmt(d: string): string {
  return new Date(d).toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric' })
}

function days(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return Math.floor(ms / 86400000) + 1
}

export default async function LeavePage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId } = session

  const db = await getDb()
  const [rows, staff] = await Promise.all([
    db
      .select({
        id: leaveRequests.id,
        type: leaveRequests.leaveType,
        start: leaveRequests.startDate,
        end: leaveRequests.endDate,
        status: leaveRequests.status,
        reason: leaveRequests.reason,
        employeeName: employees.name,
        employeeNumber: employees.employeeNumber,
      })
      .from(leaveRequests)
      .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
      .where(eq(leaveRequests.tenantId, tenantId))
      .orderBy(desc(leaveRequests.createdAt))
      .limit(200),
    db
      .select({ id: employees.id, name: employees.name, number: employees.employeeNumber })
      .from(employees)
      .where(eq(employees.tenantId, tenantId))
      .orderBy(employees.name),
  ])

  const pending = rows.filter((r) => r.status === 'pending')

  return (
    <div className="space-y-6">
      <PageHeader
        title="الإجازات"
        subtitle="طلبات الإجازة واعتمادها — الاستحقاق محسوب وفق نظام العمل السعودي"
        action={
          <AddResourceDialog
            title="طلب إجازة"
            triggerLabel="طلب إجازة"
            action={createLeaveAction}
            fields={[
              {
                name: 'employeeId',
                label: 'الموظف',
                type: 'select',
                required: true,
                options: staff.map((s) => ({ value: s.id, label: `${s.number} · ${s.name}` })),
              },
              {
                name: 'leaveType',
                label: 'نوع الإجازة',
                type: 'select',
                required: true,
                options: [
                  { value: 'annual', label: 'سنوية' },
                  { value: 'sick', label: 'مرضية' },
                  { value: 'unpaid', label: 'بدون راتب' },
                  { value: 'maternity', label: 'وضع' },
                  { value: 'other', label: 'أخرى' },
                ],
              },
              { name: 'startDate', label: 'من تاريخ', type: 'date', required: true },
              { name: 'endDate', label: 'إلى تاريخ', type: 'date', required: true },
              { name: 'reason', label: 'السبب' },
            ]}
          />
        }
      />
      <HrTabs active="leave" />

      {pending.length > 0 && (
        <Card className="border-warning-500/40 bg-warning-500/[0.05]">
          <div className="p-4">
            <p className="mb-3 text-sm font-semibold text-warning-600">
              بانتظار الاعتماد ({pending.length})
            </p>
            <div className="space-y-2">
              {pending.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[color:var(--surface-raised)] px-3 py-2.5"
                >
                  <div className="text-sm">
                    <span className="font-medium">{r.employeeName}</span>
                    <span className="text-[color:var(--text-tertiary)]">
                      {' '}
                      · {TYPE_LABELS[r.type] ?? r.type} · {fmt(r.start)} — {fmt(r.end)} (
                      {days(r.start, r.end)} يوم)
                    </span>
                  </div>
                  <LeaveDecisionButtons leaveRequestId={r.id} />
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>الموظف</TableHeaderCell>
              <TableHeaderCell>النوع</TableHeaderCell>
              <TableHeaderCell>الفترة</TableHeaderCell>
              <TableHeaderCell className="text-end">الأيام</TableHeaderCell>
              <TableHeaderCell>الحالة</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium">{r.employeeName}</div>
                  <div className="font-mono text-[11px] text-[color:var(--text-tertiary)]">
                    {r.employeeNumber}
                  </div>
                </TableCell>
                <TableCell>{TYPE_LABELS[r.type] ?? r.type}</TableCell>
                <TableCell className="text-sm">
                  {fmt(r.start)} — {fmt(r.end)}
                </TableCell>
                <TableCell className="tabular-figures text-end">{days(r.start, r.end)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_TONE[r.status] ?? 'neutral'}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-[color:var(--text-tertiary)]">
                  لا توجد طلبات إجازة بعد.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq, desc } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { employeeTasks, employees } from '@/db/schema'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/app-shell/page-header'
import { AddResourceDialog } from '@/components/forms/resource-form'
import { HrTabs } from '../hr-tabs'
import { assignTaskAction } from './actions'
import { TaskStatusSelect } from './task-status'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from '@/components/ui/table'

const STATUS_LABELS: Record<string, string> = {
  pending: 'قيد الانتظار',
  in_progress: 'جارية',
  done: 'منجزة',
  cancelled: 'ملغاة',
}
const STATUS_TONE: Record<string, 'neutral' | 'accent' | 'success' | 'danger'> = {
  pending: 'neutral',
  in_progress: 'accent',
  done: 'success',
  cancelled: 'danger',
}

function fmt(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric' })
}

export default async function TasksPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId } = session

  const db = await getDb()
  const [rows, staff] = await Promise.all([
    db
      .select({
        id: employeeTasks.id,
        title: employeeTasks.title,
        description: employeeTasks.description,
        dueDate: employeeTasks.dueDate,
        status: employeeTasks.status,
        employeeName: employees.name,
        employeeNumber: employees.employeeNumber,
      })
      .from(employeeTasks)
      .innerJoin(employees, eq(employeeTasks.employeeId, employees.id))
      .where(eq(employeeTasks.tenantId, tenantId))
      .orderBy(desc(employeeTasks.createdAt))
      .limit(200),
    db
      .select({ id: employees.id, name: employees.name, number: employees.employeeNumber })
      .from(employees)
      .where(eq(employees.tenantId, tenantId))
      .orderBy(employees.name),
  ])

  const open = rows.filter((r) => r.status === 'pending' || r.status === 'in_progress')

  return (
    <div className="space-y-6">
      <PageHeader
        title="مهام الموظفين"
        subtitle={`${open.length} مهمة مفتوحة من أصل ${rows.length}`}
        action={
          <AddResourceDialog
            title="إسناد مهمة"
            triggerLabel="إسناد مهمة"
            action={assignTaskAction}
            fields={[
              {
                name: 'employeeId',
                label: 'الموظف',
                type: 'select',
                required: true,
                options: staff.map((s) => ({ value: s.id, label: `${s.number} · ${s.name}` })),
              },
              { name: 'title', label: 'عنوان المهمة', required: true, placeholder: 'جرد الفرع' },
              { name: 'description', label: 'التفاصيل' },
              { name: 'dueDate', label: 'تاريخ الاستحقاق', type: 'date' },
            ]}
          />
        }
      />
      <HrTabs active="tasks" />

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>المهمة</TableHeaderCell>
              <TableHeaderCell>الموظف</TableHeaderCell>
              <TableHeaderCell>الاستحقاق</TableHeaderCell>
              <TableHeaderCell>الحالة</TableHeaderCell>
              <TableHeaderCell className="text-end">تغيير</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium">{r.title}</div>
                  {r.description && (
                    <div className="text-[11px] text-[color:var(--text-tertiary)]">
                      {r.description}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="text-sm">{r.employeeName}</div>
                  <div className="font-mono text-[11px] text-[color:var(--text-tertiary)]">
                    {r.employeeNumber}
                  </div>
                </TableCell>
                <TableCell>{fmt(r.dueDate)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_TONE[r.status] ?? 'neutral'}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <TaskStatusSelect taskId={r.id} status={r.status} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-[color:var(--text-tertiary)]">
                  لا توجد مهام بعد.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

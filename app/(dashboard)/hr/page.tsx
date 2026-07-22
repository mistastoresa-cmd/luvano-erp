import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { createEmployeesService } from '@/lib/employees/service'
import { ForbiddenError } from '@/lib/authz/errors'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/app-shell/page-header'
import { AddResourceDialog } from '@/components/forms/resource-form'
import { createEmployeeAction } from './actions'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from '@/components/ui/table'

const STATUS_LABELS: Record<string, string> = {
  active: 'على رأس العمل',
  terminated: 'منتهي الخدمة',
  suspended: 'موقوف',
}

export default async function HRPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId, context } = session

  const db = await getDb()
  let rows: Awaited<ReturnType<ReturnType<typeof createEmployeesService>['listEmployees']>> = []
  let denied = false
  try {
    rows = await createEmployeesService(db).listEmployees(context, tenantId)
  } catch (err) {
    if (err instanceof ForbiddenError) denied = true
    else throw err
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="الموارد البشرية"
        subtitle="سجل الموظفين وبياناتهم الوظيفية"
        action={
          denied ? undefined : (
            <AddResourceDialog
              title="إضافة موظف"
              triggerLabel="إضافة موظف"
              action={createEmployeeAction}
              fields={[
                { name: 'name', label: 'الاسم', required: true },
                { name: 'hireDate', label: 'تاريخ التعيين', type: 'date', required: true },
                { name: 'baseSalary', label: 'الراتب الأساسي', type: 'number', required: true },
                { name: 'jobTitle', label: 'المسمى الوظيفي' },
                { name: 'department', label: 'القسم' },
                { name: 'phone', label: 'الجوال', type: 'tel' },
                { name: 'email', label: 'البريد', type: 'email' },
                { name: 'nationalId', label: 'الهوية/الإقامة' },
                { name: 'ibanNumber', label: 'الآيبان' },
              ]}
            />
          )
        }
      />

      {denied ? (
        <Card>
          <CardContent className="py-6 text-sm text-[color:var(--text-tertiary)]">
            لا تملك صلاحية عرض بيانات الموظفين.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>الرقم الوظيفي</TableHeaderCell>
                <TableHeaderCell>الاسم</TableHeaderCell>
                <TableHeaderCell>المسمى</TableHeaderCell>
                <TableHeaderCell>القسم</TableHeaderCell>
                <TableHeaderCell>الحالة</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="tabular-figures font-mono text-xs">{e.employeeNumber}</TableCell>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>{e.jobTitle ?? '—'}</TableCell>
                  <TableCell>{e.department ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={e.status === 'active' ? 'success' : e.status === 'terminated' ? 'danger' : 'warning'}>
                      {STATUS_LABELS[e.status] ?? e.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-[color:var(--text-tertiary)]">
                    لا يوجد موظفون مسجّلون بعد.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}

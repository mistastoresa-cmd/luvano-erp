import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { createEmployeesService } from '@/lib/employees/service'
import { ForbiddenError } from '@/lib/authz/errors'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
      <div>
        <h1 className="text-lg font-semibold text-[color:var(--text-primary)]">الموارد البشرية</h1>
        <p className="mt-1 text-sm text-[color:var(--text-tertiary)]">سجل الموظفين وبياناتهم الوظيفية</p>
      </div>

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

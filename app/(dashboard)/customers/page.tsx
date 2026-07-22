import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { createCustomersService } from '@/lib/customers/service'
import { ForbiddenError } from '@/lib/authz/errors'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from '@/components/ui/table'

export default async function CustomersPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId, context } = session

  const db = await getDb()
  let rows: Awaited<ReturnType<ReturnType<typeof createCustomersService>['listCustomers']>> = []
  let denied = false
  try {
    rows = await createCustomersService(db).listCustomers(context, tenantId)
  } catch (err) {
    if (err instanceof ForbiddenError) denied = true
    else throw err
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-[color:var(--text-primary)]">العملاء</h1>
        <p className="mt-1 text-sm text-[color:var(--text-tertiary)]">
          قاعدة عملاء المتجر — من نقاط البيع ومن سلة
        </p>
      </div>

      {denied ? (
        <Card>
          <CardContent className="py-6 text-sm text-[color:var(--text-tertiary)]">
            لا تملك صلاحية عرض العملاء.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>الاسم</TableHeaderCell>
                <TableHeaderCell>الجوال</TableHeaderCell>
                <TableHeaderCell>البريد</TableHeaderCell>
                <TableHeaderCell>ملاحظات</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="tabular-figures">{c.phone ?? '—'}</TableCell>
                  <TableCell>{c.email ?? '—'}</TableCell>
                  <TableCell className="text-[color:var(--text-tertiary)]">{c.notes ?? '—'}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-[color:var(--text-tertiary)]">
                    لا يوجد عملاء مسجّلون بعد.
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

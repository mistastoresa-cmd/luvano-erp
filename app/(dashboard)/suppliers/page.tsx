import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { suppliers } from '@/db/schema'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app-shell/page-header'
import { AddResourceDialog } from '@/components/forms/resource-form'
import { createSupplierAction } from './actions'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from '@/components/ui/table'

export default async function SuppliersPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId } = session

  const db = await getDb()
  const rows = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.tenantId, tenantId))
    .orderBy(suppliers.name)

  return (
    <div className="space-y-6">
      <PageHeader
        title="الموردون"
        subtitle="موردو الشركة وبيانات التواصل وشروط الدفع"
        action={
          <AddResourceDialog
            title="إضافة مورد"
            triggerLabel="إضافة مورد"
            action={createSupplierAction}
            fields={[
              { name: 'name', label: 'اسم المورد', required: true },
              { name: 'contactName', label: 'اسم المسؤول' },
              { name: 'phone', label: 'الجوال', type: 'tel' },
              { name: 'email', label: 'البريد', type: 'email' },
              { name: 'taxNumber', label: 'الرقم الضريبي' },
              { name: 'paymentTermsDays', label: 'مدة السداد (أيام)', type: 'number' },
            ]}
          />
        }
      />

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>الاسم</TableHeaderCell>
              <TableHeaderCell>المسؤول</TableHeaderCell>
              <TableHeaderCell>الجوال</TableHeaderCell>
              <TableHeaderCell>الرقم الضريبي</TableHeaderCell>
              <TableHeaderCell className="text-end">مدة السداد</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.contactName ?? '—'}</TableCell>
                <TableCell className="tabular-figures">{s.phone ?? '—'}</TableCell>
                <TableCell className="tabular-figures">{s.taxNumber ?? '—'}</TableCell>
                <TableCell className="tabular-figures text-end">{s.paymentTermsDays} يوم</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-[color:var(--text-tertiary)]">
                  لا يوجد موردون بعد.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

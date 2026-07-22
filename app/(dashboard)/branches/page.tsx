import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { branches } from '@/db/schema'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/app-shell/page-header'
import { AddResourceDialog } from '@/components/forms/resource-form'
import { createBranchAction } from './actions'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from '@/components/ui/table'

const TYPE_LABELS: Record<string, string> = {
  physical: 'فرع فعلي',
  online: 'متجر إلكتروني',
  warehouse: 'مستودع',
}

export default async function BranchesPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId, context } = session

  const db = await getDb()
  const rows = await db
    .select()
    .from(branches)
    .where(eq(branches.tenantId, tenantId))
    .orderBy(branches.name)

  const isOwner = context.role === 'owner'

  return (
    <div className="space-y-6">
      <PageHeader
        title="الفروع"
        subtitle="فروع الشركة والمستودعات — الأساس لكل حركات المخزون والمبيعات"
        action={
          isOwner ? (
            <AddResourceDialog
              title="إضافة فرع"
              triggerLabel="إضافة فرع"
              action={createBranchAction}
              fields={[
                { name: 'name', label: 'اسم الفرع', required: true, placeholder: 'فرع الرياض' },
                { name: 'code', label: 'الرمز', required: true, placeholder: 'RIYADH-01' },
                {
                  name: 'type',
                  label: 'النوع',
                  type: 'select',
                  required: true,
                  options: [
                    { value: 'physical', label: 'فرع فعلي' },
                    { value: 'online', label: 'متجر إلكتروني' },
                    { value: 'warehouse', label: 'مستودع' },
                  ],
                },
                { name: 'accountingCode', label: 'الرمز المحاسبي (اختياري)' },
              ]}
            />
          ) : undefined
        }
      />

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>الاسم</TableHeaderCell>
              <TableHeaderCell>الرمز</TableHeaderCell>
              <TableHeaderCell>النوع</TableHeaderCell>
              <TableHeaderCell>الحالة</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.name}</TableCell>
                <TableCell className="font-mono text-xs">{b.code}</TableCell>
                <TableCell>{TYPE_LABELS[b.type] ?? b.type}</TableCell>
                <TableCell>
                  <Badge variant={b.isActive ? 'success' : 'neutral'}>
                    {b.isActive ? 'نشط' : 'متوقّف'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-[color:var(--text-tertiary)]">
                  لا توجد فروع بعد — أضف أول فرع للبدء.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq, and, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { costCenters, expenses } from '@/db/schema'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/app-shell/page-header'
import { AddResourceDialog } from '@/components/forms/resource-form'
import { createCostCenterAction } from './actions'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from '@/components/ui/table'

function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default async function CostCentersPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId, context } = session

  const db = await getDb()
  const [centers, spendRows] = await Promise.all([
    db
      .select()
      .from(costCenters)
      .where(eq(costCenters.tenantId, tenantId))
      .orderBy(costCenters.code),
    // Spend per centre, from posted expenses only — drafts aren't real cost yet.
    db
      .select({
        costCenterId: expenses.costCenterId,
        total: sql<string>`coalesce(sum(${expenses.amount} + ${expenses.taxAmount}), 0)`,
        count: sql<string>`count(*)`,
      })
      .from(expenses)
      .where(and(eq(expenses.tenantId, tenantId), eq(expenses.status, 'posted')))
      .groupBy(expenses.costCenterId),
  ])

  const spendById = new Map(
    spendRows.map((r) => [r.costCenterId ?? '', { total: Number(r.total), count: Number(r.count) }])
  )
  const unassigned = spendById.get('') ?? { total: 0, count: 0 }
  const canManage = context.role === 'owner' || context.role === 'accountant'

  return (
    <div className="space-y-6">
      <PageHeader
        title="مراكز التكلفة"
        subtitle="بُعد تحليلي مستقل عن الفروع — الفرع يجيب «أين صُرف؟» ومركز التكلفة «على ماذا صُرف؟»"
        action={
          canManage ? (
            <AddResourceDialog
              title="إضافة مركز تكلفة"
              triggerLabel="إضافة مركز"
              action={createCostCenterAction}
              fields={[
                { name: 'code', label: 'الرمز', required: true, placeholder: 'CC-MKT' },
                { name: 'name', label: 'الاسم', required: true, placeholder: 'قسم التسويق' },
                { name: 'description', label: 'الوصف' },
              ]}
            />
          ) : undefined
        }
      />

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>الرمز</TableHeaderCell>
              <TableHeaderCell>المركز</TableHeaderCell>
              <TableHeaderCell className="text-end">عدد المصروفات</TableHeaderCell>
              <TableHeaderCell className="text-end">إجمالي المصروف</TableHeaderCell>
              <TableHeaderCell>الحالة</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {centers.map((c) => {
              const s = spendById.get(c.id) ?? { total: 0, count: 0 }
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell>
                    <div className="font-medium">{c.name}</div>
                    {c.description && (
                      <div className="text-[11px] text-[color:var(--text-tertiary)]">
                        {c.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="tabular-figures text-end">{s.count}</TableCell>
                  <TableCell className="tabular-figures text-end font-medium">
                    {money(s.total)} ر.س
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.isActive ? 'success' : 'neutral'}>
                      {c.isActive ? 'نشط' : 'متوقّف'}
                    </Badge>
                  </TableCell>
                </TableRow>
              )
            })}
            {unassigned.count > 0 && (
              <TableRow>
                <TableCell className="text-[color:var(--text-tertiary)]">—</TableCell>
                <TableCell className="text-[color:var(--text-tertiary)]">
                  بدون مركز تكلفة
                </TableCell>
                <TableCell className="tabular-figures text-end">{unassigned.count}</TableCell>
                <TableCell className="tabular-figures text-end">{money(unassigned.total)} ر.س</TableCell>
                <TableCell>—</TableCell>
              </TableRow>
            )}
            {centers.length === 0 && unassigned.count === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-[color:var(--text-tertiary)]">
                  لا توجد مراكز تكلفة بعد — أضف مركزاً لتوزيع المصروفات عليه.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

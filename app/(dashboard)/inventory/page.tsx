import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq, asc } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { hasBranchAccess } from '@/lib/authz/types'
import { inventoryBalances, branches } from '@/db/schema'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from '@/components/ui/table'

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default async function InventoryPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId, context } = session

  const db = await getDb()
  const rows = await db
    .select({
      id: inventoryBalances.id,
      branchId: inventoryBalances.branchId,
      branchName: branches.name,
      sku: inventoryBalances.sku,
      quantity: inventoryBalances.quantity,
      averageCost: inventoryBalances.averageCost,
    })
    .from(inventoryBalances)
    .innerJoin(branches, eq(inventoryBalances.branchId, branches.id))
    .where(eq(inventoryBalances.tenantId, tenantId))
    .orderBy(asc(branches.name), asc(inventoryBalances.sku))

  const visibleRows = rows.filter((r) => hasBranchAccess(context.branchAccess, r.branchId))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-[color:var(--text-primary)]">المخزون</h1>
        <p className="mt-1 text-sm text-[color:var(--text-tertiary)]">
          الأرصدة الحالية لكل صنف حسب الفرع، مع متوسط التكلفة المرجّح
        </p>
      </div>

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>الفرع</TableHeaderCell>
              <TableHeaderCell>SKU</TableHeaderCell>
              <TableHeaderCell className="text-end">الكمية</TableHeaderCell>
              <TableHeaderCell className="text-end">متوسط التكلفة</TableHeaderCell>
              <TableHeaderCell className="text-end">قيمة المخزون</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleRows.map((row) => {
              const cost = Number(row.averageCost)
              return (
                <TableRow key={row.id}>
                  <TableCell>{row.branchName}</TableCell>
                  <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                  <TableCell className="tabular-figures text-end">
                    <Badge variant={row.quantity <= 0 ? 'danger' : 'neutral'}>{row.quantity}</Badge>
                  </TableCell>
                  <TableCell className="tabular-figures text-end">{formatCurrency(cost)} ر.س</TableCell>
                  <TableCell className="tabular-figures text-end">
                    {formatCurrency(cost * row.quantity)} ر.س
                  </TableCell>
                </TableRow>
              )
            })}
            {visibleRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-[color:var(--text-tertiary)]">
                  لا توجد أرصدة مخزون حتى الآن.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

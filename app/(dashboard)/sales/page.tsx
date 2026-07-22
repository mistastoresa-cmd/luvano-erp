import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq, and, desc } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { hasBranchAccess } from '@/lib/authz/types'
import { saleInvoices, branches } from '@/db/schema'
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

const STATUS_LABELS: Record<string, string> = {
  completed: 'مكتملة',
  refunded: 'مُرجَعة',
  partially_refunded: 'إرجاع جزئي',
  voided: 'ملغاة',
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  completed: 'success',
  refunded: 'danger',
  partially_refunded: 'warning',
  voided: 'neutral',
}

const SOURCE_LABELS: Record<string, string> = {
  salla_order: 'سلة',
  branch_pos: 'نقطة بيع',
  branch_offline: 'غير متصل',
}

export default async function SalesPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId, context } = session

  const db = await getDb()
  const rows = await db
    .select({
      id: saleInvoices.id,
      invoiceNumber: saleInvoices.invoiceNumber,
      branchId: saleInvoices.branchId,
      branchName: branches.name,
      sourceType: saleInvoices.sourceType,
      customerName: saleInvoices.customerName,
      status: saleInvoices.status,
      total: saleInvoices.total,
      occurredAt: saleInvoices.occurredAt,
      journalEntryId: saleInvoices.journalEntryId,
    })
    .from(saleInvoices)
    .innerJoin(branches, eq(saleInvoices.branchId, branches.id))
    .where(eq(saleInvoices.tenantId, tenantId))
    .orderBy(desc(saleInvoices.occurredAt))
    .limit(100)

  const visibleRows = rows.filter((r) => hasBranchAccess(context.branchAccess, r.branchId))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-[color:var(--text-primary)]">فواتير البيع</h1>
        <p className="mt-1 text-sm text-[color:var(--text-tertiary)]">
          آخر {visibleRows.length} فاتورة — اضغط على أي فاتورة لعرض دورتها المستندية الكاملة
        </p>
      </div>

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>رقم الفاتورة</TableHeaderCell>
              <TableHeaderCell>الفرع</TableHeaderCell>
              <TableHeaderCell>المصدر</TableHeaderCell>
              <TableHeaderCell>العميل</TableHeaderCell>
              <TableHeaderCell>الحالة</TableHeaderCell>
              <TableHeaderCell>الترحيل المحاسبي</TableHeaderCell>
              <TableHeaderCell className="text-end">الإجمالي</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleRows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link
                    href={`/sales/${row.id}`}
                    className="font-medium text-accent-600 hover:underline"
                  >
                    {row.invoiceNumber}
                  </Link>
                </TableCell>
                <TableCell>{row.branchName}</TableCell>
                <TableCell>{SOURCE_LABELS[row.sourceType] ?? row.sourceType}</TableCell>
                <TableCell>{row.customerName ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_TONE[row.status] ?? 'neutral'}>
                    {STATUS_LABELS[row.status] ?? row.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={row.journalEntryId ? 'success' : 'warning'}>
                    {row.journalEntryId ? 'مُرحَّل' : 'غير مُرحَّل'}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-figures text-end">
                  {formatCurrency(Number(row.total))} ر.س
                </TableCell>
              </TableRow>
            ))}
            {visibleRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-[color:var(--text-tertiary)]">
                  لا توجد فواتير بيع حتى الآن.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

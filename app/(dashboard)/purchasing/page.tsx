import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq, and, desc } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { hasBranchAccess } from '@/lib/authz/types'
import { purchaseOrders, suppliers, branches } from '@/db/schema'
import Link from 'next/link'
import { Plus } from '@phosphor-icons/react/dist/ssr'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app-shell/page-header'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from '@/components/ui/table'

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  sent: 'مُرسَل',
  partially_received: 'استلام جزئي',
  received: 'مُستَلَم',
  cancelled: 'ملغى',
}
const STATUS_TONE: Record<string, 'neutral' | 'accent' | 'warning' | 'success' | 'danger'> = {
  draft: 'neutral',
  sent: 'accent',
  partially_received: 'warning',
  received: 'success',
  cancelled: 'danger',
}

function formatDate(d: Date | string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default async function PurchasingPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId, context } = session

  const db = await getDb()
  const rows = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      branchId: purchaseOrders.branchId,
      branchName: branches.name,
      supplierName: suppliers.name,
      status: purchaseOrders.status,
      orderDate: purchaseOrders.orderDate,
      expectedDate: purchaseOrders.expectedDate,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .innerJoin(branches, eq(purchaseOrders.branchId, branches.id))
    .where(eq(purchaseOrders.tenantId, tenantId))
    .orderBy(desc(purchaseOrders.orderDate))
    .limit(100)

  const visible = rows.filter((r) => hasBranchAccess(context.branchAccess, r.branchId))

  return (
    <div className="space-y-6">
      <PageHeader
        title="المشتريات"
        subtitle="أوامر الشراء ومراحل استلامها من الموردين"
        action={
          <Link href="/purchasing/new">
            <Button>
              <Plus size={16} weight="bold" />
              أمر شراء جديد
            </Button>
          </Link>
        }
      />

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>رقم الأمر</TableHeaderCell>
              <TableHeaderCell>المورد</TableHeaderCell>
              <TableHeaderCell>الفرع</TableHeaderCell>
              <TableHeaderCell>الحالة</TableHeaderCell>
              <TableHeaderCell>تاريخ الأمر</TableHeaderCell>
              <TableHeaderCell>الاستلام المتوقّع</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.poNumber}</TableCell>
                <TableCell>{r.supplierName}</TableCell>
                <TableCell>{r.branchName}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_TONE[r.status] ?? 'neutral'}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(r.orderDate)}</TableCell>
                <TableCell>{formatDate(r.expectedDate)}</TableCell>
              </TableRow>
            ))}
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-[color:var(--text-tertiary)]">
                  لا توجد أوامر شراء بعد.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

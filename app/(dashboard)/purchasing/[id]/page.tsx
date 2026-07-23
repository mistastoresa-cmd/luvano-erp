import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { eq, and, sql } from 'drizzle-orm'
import { CaretLeft } from '@phosphor-icons/react/dist/ssr'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { hasBranchAccess } from '@/lib/authz/types'
import {
  purchaseOrders,
  purchaseOrderLines,
  goodsReceiptLines,
  goodsReceipts,
  suppliers,
  branches,
} from '@/db/schema'
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
import { SendButton, ReceivePanel, type POLine } from './receive-panel'

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

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId, context } = session

  const db = await getDb()
  const [po] = await db
    .select({
      id: purchaseOrders.id,
      number: purchaseOrders.poNumber,
      status: purchaseOrders.status,
      branchId: purchaseOrders.branchId,
      branchName: branches.name,
      supplierName: suppliers.name,
      orderDate: purchaseOrders.orderDate,
      notes: purchaseOrders.notes,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .innerJoin(branches, eq(purchaseOrders.branchId, branches.id))
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId)))
    .limit(1)
  if (!po) notFound()
  if (!hasBranchAccess(context.branchAccess, po.branchId)) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-[color:var(--text-tertiary)]">
          لا تملك صلاحية عرض هذا الأمر.
        </CardContent>
      </Card>
    )
  }

  const orderLines = await db
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.purchaseOrderId, id))

  // How much of each line has already been received across all receipts.
  const receivedRows = await db
    .select({
      sku: goodsReceiptLines.sku,
      total: sql<string>`coalesce(sum(${goodsReceiptLines.quantityReceived}), 0)`,
    })
    .from(goodsReceiptLines)
    .innerJoin(goodsReceipts, eq(goodsReceiptLines.goodsReceiptId, goodsReceipts.id))
    .where(eq(goodsReceipts.purchaseOrderId, id))
    .groupBy(goodsReceiptLines.sku)
  const receivedBySku = new Map(receivedRows.map((r) => [r.sku, Number(r.total)]))

  const lines: POLine[] = orderLines.map((l) => ({
    sku: l.sku,
    productName: l.productName,
    quantityOrdered: l.quantityOrdered,
    quantityReceivedSoFar: receivedBySku.get(l.sku) ?? 0,
    unitCost: Number(l.unitCost),
  }))

  const total = lines.reduce((s, l) => s + l.quantityOrdered * l.unitCost, 0)
  const canReceive = po.status === 'sent' || po.status === 'partially_received'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 text-sm text-[color:var(--text-tertiary)]">
        <Link href="/purchasing" className="hover:text-accent-600">
          المشتريات
        </Link>
        <CaretLeft size={13} />
        <span className="text-[color:var(--text-secondary)]">{po.number}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[color:var(--text-primary)]">أمر شراء {po.number}</h1>
          <p className="mt-1 text-sm text-[color:var(--text-tertiary)]">
            {po.supplierName} · {po.branchName}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={STATUS_TONE[po.status] ?? 'neutral'}>
            {STATUS_LABELS[po.status] ?? po.status}
          </Badge>
          {po.status === 'draft' && <SendButton purchaseOrderId={po.id} />}
        </div>
      </div>

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>الصنف</TableHeaderCell>
              <TableHeaderCell className="text-end">مطلوب</TableHeaderCell>
              <TableHeaderCell className="text-end">مستلم</TableHeaderCell>
              <TableHeaderCell className="text-end">التكلفة</TableHeaderCell>
              <TableHeaderCell className="text-end">الإجمالي</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.sku}>
                <TableCell>
                  <div className="font-medium">{l.productName}</div>
                  <div className="font-mono text-[11px] text-[color:var(--text-tertiary)]">{l.sku}</div>
                </TableCell>
                <TableCell className="tabular-figures text-end">{l.quantityOrdered}</TableCell>
                <TableCell className="tabular-figures text-end">
                  <Badge variant={l.quantityReceivedSoFar >= l.quantityOrdered ? 'success' : 'neutral'}>
                    {l.quantityReceivedSoFar}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-figures text-end">{l.unitCost.toFixed(2)}</TableCell>
                <TableCell className="tabular-figures text-end">
                  {(l.quantityOrdered * l.unitCost).toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t border-[color:var(--border-subtle)] px-4 py-3 text-sm">
          <span className="text-[color:var(--text-secondary)]">إجمالي الأمر</span>
          <span className="tabular-figures font-bold">{total.toFixed(2)} ر.س</span>
        </div>
      </Card>

      {canReceive && <ReceivePanel purchaseOrderId={po.id} lines={lines} />}
    </div>
  )
}

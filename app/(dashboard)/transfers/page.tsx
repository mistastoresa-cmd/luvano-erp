import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq, desc, aliasedTable } from 'drizzle-orm'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { hasBranchAccess } from '@/lib/authz/types'
import { stockTransfers, stockTransferLines, branches } from '@/db/schema'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/app-shell/page-header'
import { NewTransferDialog } from './new-transfer-dialog'
import { TransferActionButtons } from './transfer-actions-buttons'

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  in_transit: 'جاري التحويل',
  completed: 'مكتمل',
  cancelled: 'ملغى',
}
const STATUS_TONE: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = {
  draft: 'neutral',
  in_transit: 'warning',
  completed: 'success',
  cancelled: 'danger',
}

function fmtDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default async function TransfersPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId, context } = session

  const db = await getDb()
  const fromB = aliasedTable(branches, 'fromB')
  const toB = aliasedTable(branches, 'toB')

  const rows = await db
    .select({
      id: stockTransfers.id,
      number: stockTransfers.transferNumber,
      status: stockTransfers.status,
      transferDate: stockTransfers.transferDate,
      fromBranchId: stockTransfers.fromBranchId,
      toBranchId: stockTransfers.toBranchId,
      fromName: fromB.name,
      toName: toB.name,
      lineCount: db.$count(stockTransferLines, eq(stockTransferLines.transferId, stockTransfers.id)),
    })
    .from(stockTransfers)
    .innerJoin(fromB, eq(stockTransfers.fromBranchId, fromB.id))
    .innerJoin(toB, eq(stockTransfers.toBranchId, toB.id))
    .where(eq(stockTransfers.tenantId, tenantId))
    .orderBy(desc(stockTransfers.createdAt))
    .limit(100)

  const branchRows = await db
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(eq(branches.tenantId, tenantId))
    .orderBy(branches.name)
  const myBranches = branchRows.filter((b) => hasBranchAccess(context.branchAccess, b.id))

  // Transfers awaiting THIS user's approval (they can access the receiving
  // branch) — surfaced as the "pending / جاري التحويل" queue up top.
  const pendingForMe = rows.filter(
    (r) => r.status === 'in_transit' && hasBranchAccess(context.branchAccess, r.toBranchId)
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="تحويلات المخزون"
        subtitle="تحويل الأصناف بين الفروع مع تعميد الفرع المستلم"
        action={<NewTransferDialog branches={myBranches} />}
      />

      {pendingForMe.length > 0 && (
        <Card className="border-warning-500/40 bg-warning-500/[0.05]">
          <CardContent className="p-4">
            <p className="mb-3 text-sm font-semibold text-warning-600">
              بانتظار تعميدك ({pendingForMe.length}) — منتجات معلّقة واردة لفرعك
            </p>
            <div className="space-y-2">
              {pendingForMe.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[color:var(--surface-raised)] px-3 py-2.5"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{r.number}</span>
                    <span className="flex items-center gap-1 text-[color:var(--text-tertiary)]">
                      {r.fromName}
                      <ArrowRight size={13} />
                      {r.toName}
                    </span>
                    <span className="text-[color:var(--text-tertiary)]">· {r.lineCount} صنف</span>
                  </div>
                  <TransferActionButtons transferId={r.id} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-[color:var(--border-subtle)]">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="flex items-center gap-2.5 text-sm">
                  <span className="font-medium text-[color:var(--text-primary)]">{r.number}</span>
                  <span className="flex items-center gap-1 text-[color:var(--text-secondary)]">
                    {r.fromName}
                    <ArrowRight size={13} className="text-[color:var(--text-tertiary)]" />
                    {r.toName}
                  </span>
                  <span className="text-xs text-[color:var(--text-tertiary)]">
                    {r.lineCount} صنف · {fmtDate(r.transferDate)}
                  </span>
                </div>
                <Badge variant={STATUS_TONE[r.status] ?? 'neutral'}>
                  {STATUS_LABELS[r.status] ?? r.status}
                </Badge>
              </div>
            ))}
            {rows.length === 0 && (
              <div className="py-12 text-center text-sm text-[color:var(--text-tertiary)]">
                لا توجد تحويلات بعد.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

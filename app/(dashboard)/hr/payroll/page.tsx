import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq, desc, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { payrollRuns, payrollEntries } from '@/db/schema'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/app-shell/page-header'
import { AddResourceDialog } from '@/components/forms/resource-form'
import { HrTabs } from '../hr-tabs'
import { createPayrollRunAction } from './actions'
import { ProcessButton, PostButton } from './payroll-buttons'
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
  processed: 'محتسب',
  paid: 'مدفوع',
}
const STATUS_TONE: Record<string, 'neutral' | 'accent' | 'success'> = {
  draft: 'neutral',
  processed: 'accent',
  paid: 'success',
}

function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmt(d: string): string {
  return new Date(d).toLocaleDateString('ar-SA-u-nu-latn', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default async function PayrollPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId } = session

  const db = await getDb()
  const runs = await db
    .select()
    .from(payrollRuns)
    .where(eq(payrollRuns.tenantId, tenantId))
    .orderBy(desc(payrollRuns.periodStart))
    .limit(60)

  // Net pay + headcount per run, so each row shows what it actually costs.
  const totals = await db
    .select({
      payrollRunId: payrollEntries.payrollRunId,
      net: sql<string>`coalesce(sum(${payrollEntries.netPay}), 0)`,
      count: sql<string>`count(*)`,
      posted: sql<string>`count(${payrollEntries.journalEntryId})`,
    })
    .from(payrollEntries)
    .groupBy(payrollEntries.payrollRunId)
  const byRun = new Map(
    totals.map((t) => [
      t.payrollRunId,
      { net: Number(t.net), count: Number(t.count), posted: Number(t.posted) },
    ])
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="الرواتب"
        subtitle="مسيّرات الرواتب — احتساب ثم ترحيل محاسبي (مدين مصروف الرواتب / دائن رواتب مستحقة)"
        action={
          <AddResourceDialog
            title="مسيّر رواتب جديد"
            triggerLabel="مسيّر جديد"
            action={createPayrollRunAction}
            fields={[
              { name: 'periodStart', label: 'بداية الفترة', type: 'date', required: true },
              { name: 'periodEnd', label: 'نهاية الفترة', type: 'date', required: true },
            ]}
          />
        }
      />
      <HrTabs active="payroll" />

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>الفترة</TableHeaderCell>
              <TableHeaderCell className="text-end">الموظفون</TableHeaderCell>
              <TableHeaderCell className="text-end">صافي الرواتب</TableHeaderCell>
              <TableHeaderCell>الحالة</TableHeaderCell>
              <TableHeaderCell className="text-end">إجراء</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {runs.map((r) => {
              const t = byRun.get(r.id) ?? { net: 0, count: 0, posted: 0 }
              const isPosted = t.count > 0 && t.posted === t.count
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">
                    {fmt(r.periodStart)} — {fmt(r.periodEnd)}
                  </TableCell>
                  <TableCell className="tabular-figures text-end">{t.count}</TableCell>
                  <TableCell className="tabular-figures text-end font-medium">
                    {money(t.net)} ر.س
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={STATUS_TONE[r.status] ?? 'neutral'}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                      {isPosted && <Badge variant="success">مُرحَّل</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      {r.status === 'draft' ? (
                        <ProcessButton payrollRunId={r.id} />
                      ) : !isPosted ? (
                        <PostButton payrollRunId={r.id} />
                      ) : (
                        <span className="text-xs text-[color:var(--text-tertiary)]">—</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
            {runs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-[color:var(--text-tertiary)]">
                  لا توجد مسيّرات رواتب بعد — أنشئ مسيّراً للفترة ثم احتسبه.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

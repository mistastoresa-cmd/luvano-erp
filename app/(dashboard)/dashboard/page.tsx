import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { sql, eq, and, gte } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { createReportingService } from '@/lib/reporting/service'
import { ForbiddenError } from '@/lib/authz/errors'
import { reconciliationAlerts, saleInvoices } from '@/db/schema'
import { StatCard } from '@/components/ui/stat-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SalesChart, type DailySalesPoint } from '@/components/charts/sales-chart'
import { WarningCircle } from '@phosphor-icons/react/dist/ssr'

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default async function DashboardPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId, context } = session

  const db = await getDb()
  const reporting = createReportingService(db)

  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  let revenue = 0
  let netProfit = 0
  let totalAssets = 0
  let reportAccessDenied = false

  try {
    const [pnl, balanceSheet] = await Promise.all([
      reporting.getCompanyProfitAndLoss(context, tenantId, monthStart, now),
      reporting.getCompanyBalanceSheet(context, tenantId, now),
    ])
    revenue = pnl.totalRevenue
    netProfit = pnl.netProfit
    totalAssets = balanceSheet.totalAssets
  } catch (err) {
    if (err instanceof ForbiddenError) {
      reportAccessDenied = true
    } else {
      throw err
    }
  }

  const [alertRow] = await db
    .select({ count: sql<string>`count(*)` })
    .from(reconciliationAlerts)
    .where(and(eq(reconciliationAlerts.tenantId, tenantId), eq(reconciliationAlerts.resolved, false)))
  const openAlerts = Number(alertRow?.count ?? 0)

  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
  const dailySalesRows = await db
    .select({
      day: sql<string>`to_char(${saleInvoices.occurredAt}, 'YYYY-MM-DD')`,
      total: sql<string>`coalesce(sum(${saleInvoices.total}), 0)`,
    })
    .from(saleInvoices)
    .where(and(eq(saleInvoices.tenantId, tenantId), gte(saleInvoices.occurredAt, fourteenDaysAgo)))
    .groupBy(sql`to_char(${saleInvoices.occurredAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${saleInvoices.occurredAt}, 'YYYY-MM-DD')`)

  const salesChartData: DailySalesPoint[] = dailySalesRows.map((r) => ({
    date: r.day,
    total: Number(r.total),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-[color:var(--text-primary)]">لوحة التحكم</h1>
        <p className="mt-1 text-sm text-[color:var(--text-tertiary)]">نظرة عامة على أداء الشركة هذا الشهر</p>
      </div>

      {reportAccessDenied ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-sm text-[color:var(--text-tertiary)]">
            <WarningCircle size={18} />
            لا تملك صلاحية عرض التقارير المالية لهذا الحساب.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="الإيرادات (هذا الشهر)" value={formatCurrency(revenue)} suffix="ر.س" />
          <StatCard
            title="صافي الربح"
            value={formatCurrency(netProfit)}
            suffix="ر.س"
            tone={netProfit >= 0 ? 'success' : 'danger'}
          />
          <StatCard title="إجمالي الأصول" value={formatCurrency(totalAssets)} suffix="ر.س" />
          <StatCard
            title="تنبيهات مفتوحة"
            value={String(openAlerts)}
            tone={openAlerts > 0 ? 'danger' : 'neutral'}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>المبيعات اليومية (آخر 14 يوم)</CardTitle>
        </CardHeader>
        <CardContent>
          {salesChartData.length > 0 ? (
            <SalesChart data={salesChartData} />
          ) : (
            <p className="py-10 text-center text-sm text-[color:var(--text-tertiary)]">
              لا توجد مبيعات مسجّلة خلال هذه الفترة.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

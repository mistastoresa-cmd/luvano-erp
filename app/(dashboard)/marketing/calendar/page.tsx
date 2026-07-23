import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { promotions } from '@/db/schema'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/app-shell/page-header'
import { MarketingTabs } from '../marketing-tabs'

const TYPE_LABELS: Record<string, string> = {
  product_discount: 'خصم منتج',
  fixed_price: 'سعر ثابت',
  quantity_tiers: 'جدول خصومات',
  buy_x_get_y: 'اشترِ واحصل',
  loyalty_tier: 'فئة ولاء',
  bank_offer: 'عرض بنكي',
  cashback: 'كاش باك',
}

const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

function fmt(d: Date | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric' })
}

export default async function MarketingCalendarPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId } = session

  const db = await getDb()
  const rows = await db.select().from(promotions).where(eq(promotions.tenantId, tenantId))

  const now = new Date()
  const year = now.getFullYear()

  // Bucket each promotion into every month its date window overlaps. A
  // promotion with no dates runs indefinitely, so it shows in every month.
  const byMonth: Record<number, typeof rows> = {}
  for (let m = 0; m < 12; m++) byMonth[m] = []
  for (const p of rows) {
    const start = p.startsAt ? new Date(p.startsAt) : null
    const end = p.expiresAt ? new Date(p.expiresAt) : null
    for (let m = 0; m < 12; m++) {
      const monthStart = new Date(year, m, 1)
      const monthEnd = new Date(year, m + 1, 0, 23, 59, 59)
      const startsBeforeMonthEnds = !start || start <= monthEnd
      const endsAfterMonthStarts = !end || end >= monthStart
      if (startsBeforeMonthEnds && endsAfterMonthStarts) byMonth[m].push(p)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="الجدول الزمني للتسويق"
        subtitle={`خريطة العروض على شهور سنة ${year}`}
      />
      <MarketingTabs active="calendar" />

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-[color:var(--text-tertiary)]">
            لا توجد عروض لعرضها على الجدول الزمني بعد.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MONTHS.map((label, m) => {
            const items = byMonth[m]
            const isCurrent = m === now.getMonth()
            return (
              <div
                key={label}
                className={`rounded-xl border p-4 ${
                  isCurrent
                    ? 'border-accent-500 bg-accent-500/[0.04]'
                    : 'border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]'
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-[color:var(--text-primary)]">{label}</span>
                  {items.length > 0 && (
                    <Badge variant={isCurrent ? 'accent' : 'neutral'}>{items.length}</Badge>
                  )}
                </div>
                {items.length === 0 ? (
                  <p className="text-xs text-[color:var(--text-tertiary)]">لا عروض</p>
                ) : (
                  <ul className="space-y-1.5">
                    {items.slice(0, 4).map((p) => (
                      <li key={p.id} className="text-xs">
                        <span className="font-medium text-[color:var(--text-secondary)]">{p.name}</span>
                        <span className="text-[color:var(--text-tertiary)]">
                          {' · '}
                          {TYPE_LABELS[p.offerType] ?? p.offerType}
                          {p.expiresAt ? ` · حتى ${fmt(p.expiresAt)}` : ''}
                        </span>
                      </li>
                    ))}
                    {items.length > 4 && (
                      <li className="text-[11px] text-[color:var(--text-tertiary)]">
                        +{items.length - 4} أخرى
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

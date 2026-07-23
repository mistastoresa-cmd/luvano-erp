import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq, desc } from 'drizzle-orm'
import { Plus } from '@phosphor-icons/react/dist/ssr'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { promotions } from '@/db/schema'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app-shell/page-header'
import { MarketingTabs } from '../marketing-tabs'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from '@/components/ui/table'

const TYPE_LABELS: Record<string, string> = {
  product_discount: 'خصم منتج',
  fixed_price: 'سعر ثابت',
  quantity_tiers: 'جدول خصومات',
  buy_x_get_y: 'اشترِ واحصل',
  loyalty_tier: 'فئة ولاء',
  bank_offer: 'عرض بنكي',
  cashback: 'كاش باك',
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default async function OffersPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId } = session

  const db = await getDb()
  const rows = await db
    .select()
    .from(promotions)
    .where(eq(promotions.tenantId, tenantId))
    .orderBy(desc(promotions.createdAt))
    .limit(100)

  return (
    <div className="space-y-6">
      <PageHeader
        title="العروض الخاصة"
        subtitle="العروض الترويجية التي تُطبَّق آلياً عند تحقق شرطها"
        action={
          <Link href="/marketing/offers/new">
            <Button>
              <Plus size={16} weight="bold" />
              عرض جديد
            </Button>
          </Link>
        }
      />
      <MarketingTabs active="offers" />

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>اسم العرض</TableHeaderCell>
              <TableHeaderCell>النوع</TableHeaderCell>
              <TableHeaderCell className="text-end">القيمة</TableHeaderCell>
              <TableHeaderCell>ينتهي</TableHeaderCell>
              <TableHeaderCell>الحالة</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>
                  <Badge variant="accent">{TYPE_LABELS[p.offerType] ?? p.offerType}</Badge>
                </TableCell>
                <TableCell className="tabular-figures text-end">
                  {p.displayValue != null ? Number(p.displayValue).toLocaleString('en-US') : '—'}
                </TableCell>
                <TableCell>{fmtDate(p.expiresAt)}</TableCell>
                <TableCell>
                  <Badge variant={p.isActive ? 'success' : 'neutral'}>
                    {p.isActive ? 'نشط' : 'متوقّف'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-[color:var(--text-tertiary)]">
                  لا توجد عروض بعد — اضغط «عرض جديد» لإنشاء أول عرض ترويجي.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq, desc } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { coupons } from '@/db/schema'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/app-shell/page-header'
import { AddResourceDialog } from '@/components/forms/resource-form'
import { MarketingTabs } from './marketing-tabs'
import { createCouponAction } from './actions'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from '@/components/ui/table'

function formatDiscount(type: string, value: string): string {
  const n = Number(value)
  return type === 'percentage' ? `${n}%` : `${n.toLocaleString('en-US')} ر.س`
}

export default async function MarketingPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId } = session

  const db = await getDb()
  const rows = await db
    .select()
    .from(coupons)
    .where(eq(coupons.tenantId, tenantId))
    .orderBy(desc(coupons.createdAt))
    .limit(100)

  return (
    <div className="space-y-6">
      <PageHeader
        title="التسويق والعروض"
        subtitle="كوبونات الخصم التي يُدخلها العميل بكود"
        action={
          <AddResourceDialog
            title="إضافة كوبون"
            triggerLabel="إضافة كوبون"
            action={createCouponAction}
            fields={[
              { name: 'code', label: 'كود الكوبون', required: true, placeholder: 'EID2026' },
              {
                name: 'discountType',
                label: 'نوع الخصم',
                type: 'select',
                required: true,
                options: [
                  { value: 'percentage', label: 'نسبة مئوية (%)' },
                  { value: 'fixed_amount', label: 'مبلغ ثابت (ر.س)' },
                ],
              },
              { name: 'discountValue', label: 'قيمة الخصم', type: 'number', required: true },
              { name: 'maxUses', label: 'أقصى عدد استخدامات (اختياري)', type: 'number' },
            ]}
          />
        }
      />
      <MarketingTabs active="coupons" />

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>الكود</TableHeaderCell>
              <TableHeaderCell>الخصم</TableHeaderCell>
              <TableHeaderCell>الاستخدام</TableHeaderCell>
              <TableHeaderCell>الحالة</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono font-medium">{c.code}</TableCell>
                <TableCell className="tabular-figures">
                  {formatDiscount(c.discountType, c.discountValue)}
                </TableCell>
                <TableCell className="tabular-figures">
                  {c.usesCount}
                  {c.maxUses ? ` / ${c.maxUses}` : ''}
                </TableCell>
                <TableCell>
                  <Badge variant={c.isActive ? 'success' : 'neutral'}>
                    {c.isActive ? 'نشط' : 'متوقّف'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-[color:var(--text-tertiary)]">
                  لا توجد كوبونات بعد.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

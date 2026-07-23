import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { CaretLeft } from '@phosphor-icons/react/dist/ssr'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { hasBranchAccess } from '@/lib/authz/types'
import { branches } from '@/db/schema'
import { Card, CardContent } from '@/components/ui/card'
import { SaleInvoiceForm } from './invoice-form'

export default async function NewSaleInvoicePage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId, context } = session

  const db = await getDb()
  const rows = await db
    .select()
    .from(branches)
    .where(eq(branches.tenantId, tenantId))
    .orderBy(branches.name)
  const visible = rows.filter((b) => hasBranchAccess(context.branchAccess, b.id))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 text-sm text-[color:var(--text-tertiary)]">
        <Link href="/sales" className="hover:text-accent-600">
          المبيعات
        </Link>
        <CaretLeft size={13} />
        <span className="text-[color:var(--text-secondary)]">فاتورة جديدة</span>
      </div>

      <div>
        <h1 className="text-xl font-bold text-[color:var(--text-primary)]">فاتورة بيع جديدة</h1>
        <p className="mt-1 text-sm text-[color:var(--text-tertiary)]">
          تُخصم الكميات من المخزون فور الحفظ
        </p>
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-[color:var(--text-tertiary)]">
            لإصدار فاتورة تحتاج فرعاً واحداً على الأقل —{' '}
            <Link href="/branches" className="text-accent-600 hover:underline">
              أضف فرعاً
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <SaleInvoiceForm branches={visible.map((b) => ({ id: b.id, name: b.name }))} />
      )}
    </div>
  )
}

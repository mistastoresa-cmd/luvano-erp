import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { CaretLeft } from '@phosphor-icons/react/dist/ssr'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { hasBranchAccess } from '@/lib/authz/types'
import { branches, suppliers, products, productVariants } from '@/db/schema'
import { Card, CardContent } from '@/components/ui/card'
import { PurchaseOrderForm } from './po-form'

export default async function NewPurchaseOrderPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId, context } = session

  const db = await getDb()
  const [branchRows, supplierRows, catalog] = await Promise.all([
    db.select().from(branches).where(eq(branches.tenantId, tenantId)).orderBy(branches.name),
    db.select().from(suppliers).where(eq(suppliers.tenantId, tenantId)).orderBy(suppliers.name),
    db
      .select({
        sku: productVariants.sku,
        name: products.name,
        costPrice: productVariants.costPrice,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(eq(productVariants.tenantId, tenantId))
      .orderBy(products.name),
  ])
  const visibleBranches = branchRows.filter((b) => hasBranchAccess(context.branchAccess, b.id))

  const missing = visibleBranches.length === 0 || supplierRows.length === 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 text-sm text-[color:var(--text-tertiary)]">
        <Link href="/purchasing" className="hover:text-accent-600">
          المشتريات
        </Link>
        <CaretLeft size={13} />
        <span className="text-[color:var(--text-secondary)]">أمر شراء جديد</span>
      </div>

      <div>
        <h1 className="text-xl font-bold text-[color:var(--text-primary)]">أمر شراء جديد</h1>
        <p className="mt-1 text-sm text-[color:var(--text-tertiary)]">
          اختر المورد والفرع ثم أضف أصناف الأمر
        </p>
      </div>

      {missing ? (
        <Card>
          <CardContent className="space-y-2 py-8 text-center text-sm text-[color:var(--text-tertiary)]">
            <p>لإنشاء أمر شراء تحتاج فرعاً واحداً ومورداً واحداً على الأقل.</p>
            <p>
              {visibleBranches.length === 0 && (
                <Link href="/branches" className="text-accent-600 hover:underline">
                  أضف فرعاً
                </Link>
              )}
              {visibleBranches.length === 0 && supplierRows.length === 0 && ' · '}
              {supplierRows.length === 0 && (
                <Link href="/suppliers" className="text-accent-600 hover:underline">
                  أضف مورداً
                </Link>
              )}
            </p>
          </CardContent>
        </Card>
      ) : (
        <PurchaseOrderForm
          branches={visibleBranches.map((b) => ({ id: b.id, name: b.name }))}
          suppliers={supplierRows.map((s) => ({ id: s.id, name: s.name }))}
          catalog={catalog}
        />
      )}
    </div>
  )
}

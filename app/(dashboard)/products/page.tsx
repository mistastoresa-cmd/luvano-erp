import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { products, productVariants } from '@/db/schema'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app-shell/page-header'
import { AddResourceDialog } from '@/components/forms/resource-form'
import { createProductAction } from './actions'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from '@/components/ui/table'

export default async function ProductsPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId } = session

  const db = await getDb()
  const rows = await db
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      productName: products.name,
      category: products.category,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(productVariants.tenantId, tenantId))
    .orderBy(products.name)

  return (
    <div className="space-y-6">
      <PageHeader
        title="المنتجات"
        subtitle="كتالوج المنتجات وأصنافها (SKU) — الأساس للمخزون والمبيعات"
        action={
          <AddResourceDialog
            title="إضافة منتج"
            triggerLabel="إضافة منتج"
            action={createProductAction}
            fields={[
              { name: 'name', label: 'اسم المنتج', required: true, placeholder: 'عود ملكي' },
              { name: 'sku', label: 'SKU', required: true, placeholder: 'MISTA-OUD-100' },
              { name: 'category', label: 'التصنيف (اختياري)', placeholder: 'عطور رجالية' },
            ]}
          />
        }
      />

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>المنتج</TableHeaderCell>
              <TableHeaderCell>SKU</TableHeaderCell>
              <TableHeaderCell>التصنيف</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.variantId}>
                <TableCell className="font-medium">{p.productName}</TableCell>
                <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                <TableCell>{p.category ?? '—'}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-[color:var(--text-tertiary)]">
                  لا توجد منتجات بعد — أضف أول منتج للبدء.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { products, productVariants } from '@/db/schema'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/app-shell/page-header'
import { ProductCardDialog } from './product-card-dialog'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from '@/components/ui/table'

function money(v: string | null): string {
  if (v == null) return '—'
  return `${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`
}

export default async function ProductsPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId } = session

  const db = await getDb()
  const rows = await db
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      barcode: productVariants.barcode,
      sellPrice: productVariants.sellPrice,
      costPrice: productVariants.costPrice,
      reorderLevel: productVariants.reorderLevel,
      productName: products.name,
      brand: products.brand,
      category: products.category,
      imageUrl: products.imageUrl,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(productVariants.tenantId, tenantId))
    .orderBy(products.name)

  return (
    <div className="space-y-6">
      <PageHeader
        title="المنتجات"
        subtitle="كتالوج الأصناف — كرت صنف كامل بالتسعير والترميز والمخزون"
        action={<ProductCardDialog />}
      />

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell></TableHeaderCell>
              <TableHeaderCell>الصنف</TableHeaderCell>
              <TableHeaderCell>SKU / الباركود</TableHeaderCell>
              <TableHeaderCell>العلامة</TableHeaderCell>
              <TableHeaderCell className="text-end">التكلفة</TableHeaderCell>
              <TableHeaderCell className="text-end">سعر البيع</TableHeaderCell>
              <TableHeaderCell className="text-end">حد الطلب</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.variantId}>
                <TableCell>
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt={p.productName}
                      className="h-10 w-10 rounded-md border border-[color:var(--border-subtle)] object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)] text-[10px] text-[color:var(--text-tertiary)]">
                      —
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{p.productName}</div>
                  {p.category && (
                    <div className="text-[11px] text-[color:var(--text-tertiary)]">{p.category}</div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="font-mono text-xs">{p.sku}</div>
                  {p.barcode && (
                    <div className="font-mono text-[11px] text-[color:var(--text-tertiary)]">
                      {p.barcode}
                    </div>
                  )}
                </TableCell>
                <TableCell>{p.brand ?? '—'}</TableCell>
                <TableCell className="tabular-figures text-end">{money(p.costPrice)}</TableCell>
                <TableCell className="tabular-figures text-end font-medium">
                  {money(p.sellPrice)}
                </TableCell>
                <TableCell className="tabular-figures text-end">
                  {p.reorderLevel > 0 ? <Badge variant="warning">{p.reorderLevel}</Badge> : '—'}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-[color:var(--text-tertiary)]">
                  لا توجد أصناف بعد — أضف أول كرت صنف للبدء.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

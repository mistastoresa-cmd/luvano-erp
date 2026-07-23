'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { randomUUID } from 'node:crypto'
import { eq, and, inArray, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { createLedgerService } from '@/lib/ledger/service'
import { createPromotionsService } from '@/lib/promotions/service'
import { ForbiddenError } from '@/lib/authz/errors'
import { saleInvoices, productVariants, products } from '@/db/schema'
import type { CartLine } from '@/lib/promotions/types'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Spreads a total promotion discount across the invoice lines in proportion
// to each line's value, so recordSaleInvoice (which sums line.discount) ends
// up with exactly the promotion total. Any rounding remainder lands on the
// last line so the parts always re-sum to the whole.
function distributeDiscount(
  lines: { subtotal: number }[],
  totalDiscount: number
): number[] {
  const grandTotal = lines.reduce((s, l) => s + l.subtotal, 0)
  if (grandTotal <= 0 || totalDiscount <= 0) return lines.map(() => 0)
  const out = lines.map((l) => round2((totalDiscount * l.subtotal) / grandTotal))
  const assigned = out.reduce((s, d) => s + d, 0)
  const remainder = round2(totalDiscount - assigned)
  if (remainder !== 0 && out.length > 0) out[out.length - 1] = round2(out[out.length - 1] + remainder)
  return out
}

interface RawLine {
  sku?: string
  productName?: string
  quantity?: string
  unitPrice?: string
  tax?: string
}

async function nextInvoiceNumber(db: Awaited<ReturnType<typeof getDb>>, tenantId: string) {
  const [row] = await db
    .select({ count: sql<string>`count(*)` })
    .from(saleInvoices)
    .where(eq(saleInvoices.tenantId, tenantId))
  return `INV-${String(Number(row?.count ?? 0) + 1).padStart(4, '0')}`
}

export async function createSaleInvoiceAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let ok = false
  try {
    const { context, tenantId } = await requireActionSession()
    const branchId = String(formData.get('branchId') ?? '')
    if (!branchId) return { ok: false, error: 'اختر الفرع.' }

    let raw: RawLine[] = []
    try {
      raw = JSON.parse(String(formData.get('linesJson') ?? '[]'))
    } catch {
      return { ok: false, error: 'بيانات السطور غير صالحة.' }
    }

    const lines = []
    for (const [i, l] of raw.entries()) {
      const sku = (l.sku ?? '').trim()
      const qty = Number(l.quantity)
      const price = Number(l.unitPrice)
      if (!sku) return { ok: false, error: `السطر ${i + 1}: رمز الصنف مطلوب.` }
      if (!Number.isFinite(qty) || qty <= 0)
        return { ok: false, error: `السطر ${i + 1}: الكمية غير صالحة.` }
      if (!Number.isFinite(price) || price < 0)
        return { ok: false, error: `السطر ${i + 1}: السعر غير صالح.` }
      lines.push({
        sku,
        productName: (l.productName ?? '').trim() || sku,
        quantity: qty,
        unitPrice: price,
        tax: Number(l.tax) || 0,
      })
    }
    if (lines.length === 0) return { ok: false, error: 'أضف سطراً واحداً على الأقل.' }

    const db = await getDb()

    // Resolve each SKU to its product/variant so *targeted* promotions match,
    // then ask the promotions engine what discount this cart earns.
    const skus = lines.map((l) => l.sku)
    const variants = await db
      .select({
        sku: productVariants.sku,
        id: productVariants.id,
        productId: productVariants.productId,
        category: products.category,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(and(eq(productVariants.tenantId, tenantId), inArray(productVariants.sku, skus)))
    const bySku = new Map(variants.map((v) => [v.sku, v]))

    const cart: CartLine[] = lines.map((l) => ({
      sku: l.sku,
      productId: bySku.get(l.sku)?.productId,
      variantId: bySku.get(l.sku)?.id,
      category: bySku.get(l.sku)?.category ?? undefined,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
    }))
    const { totalDiscount, appliedPromotions } = await createPromotionsService(db).applyPromotions(
      context,
      tenantId,
      { lines: cart }
    )

    // Fold the earned discount into the lines so the invoice total reflects it.
    const discounts = distributeDiscount(
      lines.map((l) => ({ subtotal: l.quantity * l.unitPrice })),
      totalDiscount
    )
    const linesWithDiscount = lines.map((l, i) => ({ ...l, discount: discounts[i] }))

    await createLedgerService(db).recordSaleInvoice(context, {
      tenantId,
      branchId,
      sourceType: 'branch_pos',
      // Manually-entered invoices get a fresh uuid key — they're not replays
      // of an external event, so there's no natural dedupe key to reuse.
      idempotencyKey: `manual:${randomUUID()}`,
      occurredAt: new Date(),
      invoiceNumber: await nextInvoiceNumber(db, tenantId),
      customerName: String(formData.get('customerName') ?? '').trim() || undefined,
      customerPhone: String(formData.get('customerPhone') ?? '').trim() || undefined,
      sourceReference:
        appliedPromotions.length > 0
          ? `promos:${appliedPromotions.map((p) => p.promotionId).join(',')}`
          : undefined,
      lines: linesWithDiscount,
    })
    revalidatePath('/sales')
    ok = true
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'لا تملك صلاحية إنشاء فاتورة.' }
    return { ok: false, error: 'تعذّر حفظ الفاتورة. تأكد من توفر الرصيد.' }
  }
  if (ok) redirect('/sales')
  return { ok }
}

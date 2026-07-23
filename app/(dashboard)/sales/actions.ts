'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { createLedgerService } from '@/lib/ledger/service'
import { ForbiddenError } from '@/lib/authz/errors'
import { saleInvoices } from '@/db/schema'

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
      lines,
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

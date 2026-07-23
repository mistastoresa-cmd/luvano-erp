'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { createPurchasingService } from '@/lib/purchasing/service'
import { ForbiddenError } from '@/lib/authz/errors'
import { purchaseOrders } from '@/db/schema'

interface RawLine {
  sku?: string
  productName?: string
  quantityOrdered?: string
  unitCost?: string
}

// PO-0001, PO-0002… scoped per tenant. Sequential display numbers are what
// buyers and suppliers actually reference, so they're generated here rather
// than exposing a raw uuid.
async function nextPoNumber(db: Awaited<ReturnType<typeof getDb>>, tenantId: string) {
  const [row] = await db
    .select({ count: sql<string>`count(*)` })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.tenantId, tenantId))
  return `PO-${String(Number(row?.count ?? 0) + 1).padStart(4, '0')}`
}

export async function createPurchaseOrderAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let ok = false
  try {
    const { context, tenantId } = await requireActionSession()
    const branchId = String(formData.get('branchId') ?? '')
    const supplierId = String(formData.get('supplierId') ?? '')
    const orderDate = String(formData.get('orderDate') ?? '').trim()
    if (!branchId) return { ok: false, error: 'اختر الفرع.' }
    if (!supplierId) return { ok: false, error: 'اختر المورد.' }
    if (!orderDate) return { ok: false, error: 'تاريخ الأمر مطلوب.' }

    let raw: RawLine[] = []
    try {
      raw = JSON.parse(String(formData.get('linesJson') ?? '[]'))
    } catch {
      return { ok: false, error: 'بيانات السطور غير صالحة.' }
    }

    const lines = []
    for (const [i, l] of raw.entries()) {
      const sku = (l.sku ?? '').trim()
      const qty = Number(l.quantityOrdered)
      const cost = Number(l.unitCost)
      if (!sku) return { ok: false, error: `السطر ${i + 1}: رمز الصنف مطلوب.` }
      if (!Number.isFinite(qty) || qty <= 0)
        return { ok: false, error: `السطر ${i + 1}: الكمية غير صالحة.` }
      if (!Number.isFinite(cost) || cost < 0)
        return { ok: false, error: `السطر ${i + 1}: التكلفة غير صالحة.` }
      lines.push({
        sku,
        productName: (l.productName ?? '').trim() || sku,
        quantityOrdered: qty,
        unitCost: cost,
      })
    }
    if (lines.length === 0) return { ok: false, error: 'أضف سطراً واحداً على الأقل.' }

    const db = await getDb()
    await createPurchasingService(db).createPurchaseOrder(context, {
      tenantId,
      branchId,
      supplierId,
      poNumber: await nextPoNumber(db, tenantId),
      orderDate,
      expectedDate: String(formData.get('expectedDate') ?? '').trim() || undefined,
      notes: String(formData.get('notes') ?? '').trim() || undefined,
      lines,
    })
    revalidatePath('/purchasing')
    ok = true
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'لا تملك صلاحية إنشاء أمر شراء.' }
    return { ok: false, error: 'تعذّر حفظ أمر الشراء.' }
  }
  if (ok) redirect('/purchasing')
  return { ok }
}

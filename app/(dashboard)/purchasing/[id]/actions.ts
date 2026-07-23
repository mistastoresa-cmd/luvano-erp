'use server'

import { revalidatePath } from 'next/cache'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { createPurchasingService } from '@/lib/purchasing/service'
import { ForbiddenError } from '@/lib/authz/errors'
import { goodsReceipts } from '@/db/schema'

export async function sendPurchaseOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get('purchaseOrderId') ?? '')
  try {
    const { context, tenantId } = await requireActionSession()
    const db = await getDb()
    await createPurchasingService(db).sendPurchaseOrder(context, tenantId, id)
    revalidatePath(`/purchasing/${id}`)
    revalidatePath('/purchasing')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'لا تملك صلاحية إرسال الأمر.' }
    return { ok: false, error: 'تعذّر إرسال الأمر.' }
  }
}

interface RawLine {
  sku?: string
  quantityReceived?: string
  unitCost?: string
}

async function nextReceiptNumber(db: Awaited<ReturnType<typeof getDb>>, tenantId: string) {
  const [row] = await db
    .select({ count: sql<string>`count(*)` })
    .from(goodsReceipts)
    .where(eq(goodsReceipts.tenantId, tenantId))
  return `GR-${String(Number(row?.count ?? 0) + 1).padStart(4, '0')}`
}

export async function receivePurchaseOrderAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const purchaseOrderId = String(formData.get('purchaseOrderId') ?? '')
  try {
    const { context, tenantId } = await requireActionSession()

    let raw: RawLine[] = []
    try {
      raw = JSON.parse(String(formData.get('linesJson') ?? '[]'))
    } catch {
      return { ok: false, error: 'بيانات الاستلام غير صالحة.' }
    }

    const lines = []
    for (const l of raw) {
      const sku = (l.sku ?? '').trim()
      const qty = Number(l.quantityReceived)
      const cost = Number(l.unitCost)
      // Skip lines received as 0 — a partial receipt only lists what arrived.
      if (!sku || !Number.isFinite(qty) || qty <= 0) continue
      lines.push({ sku, quantityReceived: qty, unitCost: Number.isFinite(cost) ? cost : 0 })
    }
    if (lines.length === 0) return { ok: false, error: 'أدخل كمية مستلمة لصنف واحد على الأقل.' }

    const db = await getDb()
    await createPurchasingService(db).receivePurchaseOrder(context, {
      tenantId,
      purchaseOrderId,
      receiptNumber: await nextReceiptNumber(db, tenantId),
      receivedDate: new Date().toISOString().slice(0, 10),
      lines,
    })
    revalidatePath(`/purchasing/${purchaseOrderId}`)
    revalidatePath('/purchasing')
    revalidatePath('/inventory')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'لا تملك صلاحية الاستلام.' }
    return { ok: false, error: 'تعذّر تسجيل الاستلام.' }
  }
}

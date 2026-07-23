'use server'

import { revalidatePath } from 'next/cache'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { createWarehouseService } from '@/lib/warehouse/service'
import { assertRole } from '@/lib/authz/service'
import { ForbiddenError } from '@/lib/authz/errors'
import { stockTransfers, stockTransferLines } from '@/db/schema'

interface RawLine {
  sku?: string
  quantity?: string
}

async function nextTransferNumber(db: Awaited<ReturnType<typeof getDb>>, tenantId: string) {
  const [row] = await db
    .select({ count: sql<string>`count(*)` })
    .from(stockTransfers)
    .where(eq(stockTransfers.tenantId, tenantId))
  return `TR-${String(Number(row?.count ?? 0) + 1).padStart(4, '0')}`
}

// Create a draft transfer then immediately ship it (initiate) so the sending
// branch's stock leaves and it shows as "جاري التحويل" to the receiver.
export async function createTransferAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    assertRole(context, ['owner', 'accountant', 'branch_manager', 'staff'])
    const fromBranchId = String(formData.get('fromBranchId') ?? '')
    const toBranchId = String(formData.get('toBranchId') ?? '')
    if (!fromBranchId || !toBranchId) return { ok: false, error: 'اختر الفرع المُرسِل والمستلم.' }
    if (fromBranchId === toBranchId)
      return { ok: false, error: 'لا يمكن التحويل إلى نفس الفرع.' }

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
      if (!sku) return { ok: false, error: `السطر ${i + 1}: رمز الصنف مطلوب.` }
      if (!Number.isFinite(qty) || qty <= 0)
        return { ok: false, error: `السطر ${i + 1}: الكمية غير صالحة.` }
      lines.push({ sku, quantity: qty })
    }
    if (lines.length === 0) return { ok: false, error: 'أضف صنفاً واحداً على الأقل.' }

    const db = await getDb()
    const [transfer] = await db
      .insert(stockTransfers)
      .values({
        tenantId,
        fromBranchId,
        toBranchId,
        transferNumber: await nextTransferNumber(db, tenantId),
        transferDate: new Date().toISOString().slice(0, 10),
        notes: String(formData.get('notes') ?? '').trim() || null,
      })
      .returning()
    await db
      .insert(stockTransferLines)
      .values(lines.map((l) => ({ transferId: transfer.id, sku: l.sku, quantity: l.quantity })))

    await createWarehouseService(db).initiateStockTransfer(context, tenantId, transfer.id)
    revalidatePath('/transfers')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'لا تملك صلاحية إنشاء تحويل.' }
    return { ok: false, error: 'تعذّر إنشاء التحويل.' }
  }
}

async function phase(
  transferId: string,
  run: (svc: ReturnType<typeof createWarehouseService>, ctx: Parameters<ReturnType<typeof createWarehouseService>['approveStockTransfer']>[0], tenantId: string) => Promise<unknown>
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    const db = await getDb()
    await run(createWarehouseService(db), context, tenantId)
    revalidatePath('/transfers')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'لا تملك صلاحية هذا الإجراء على هذا الفرع.' }
    return { ok: false, error: 'تعذّر تنفيذ الإجراء.' }
  }
}

export async function approveTransferAction(_prev: ActionState, formData: FormData) {
  const id = String(formData.get('transferId') ?? '')
  return phase(id, (svc, ctx, tenantId) => svc.approveStockTransfer(ctx, tenantId, id))
}

export async function cancelTransferAction(_prev: ActionState, formData: FormData) {
  const id = String(formData.get('transferId') ?? '')
  return phase(id, (svc, ctx, tenantId) => svc.cancelStockTransfer(ctx, tenantId, id))
}

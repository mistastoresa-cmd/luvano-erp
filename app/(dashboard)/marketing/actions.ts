'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { assertRole } from '@/lib/authz/service'
import { ForbiddenError } from '@/lib/authz/errors'
import { coupons } from '@/db/schema'

const DISCOUNT_TYPES = ['percentage', 'fixed_amount'] as const

export async function createCouponAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    assertRole(context, ['owner', 'accountant', 'branch_manager'])

    const code = String(formData.get('code') ?? '').trim()
    const discountType = String(formData.get('discountType') ?? '') as (typeof DISCOUNT_TYPES)[number]
    const valueRaw = String(formData.get('discountValue') ?? '').trim()
    if (!code) return { ok: false, error: 'كود الكوبون مطلوب.' }
    if (!DISCOUNT_TYPES.includes(discountType)) return { ok: false, error: 'نوع الخصم غير صالح.' }
    const value = Number(valueRaw)
    if (!Number.isFinite(value) || value <= 0) return { ok: false, error: 'قيمة الخصم غير صالحة.' }

    const maxUsesRaw = String(formData.get('maxUses') ?? '').trim()
    const db = await getDb()
    await db.insert(coupons).values({
      tenantId,
      code,
      discountType,
      discountValue: String(value),
      maxUses: maxUsesRaw ? Number(maxUsesRaw) : null,
      isActive: true,
    })
    revalidatePath('/marketing')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'لا تملك صلاحية إضافة كوبون.' }
    return { ok: false, error: 'تعذّر حفظ الكوبون. قد يكون الكود مستخدماً مسبقاً.' }
  }
}

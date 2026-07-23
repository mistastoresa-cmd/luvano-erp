'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { assertRole } from '@/lib/authz/service'
import { ForbiddenError } from '@/lib/authz/errors'
import { promotions, promotionOfferTypes } from '@/db/schema'

type OfferType = (typeof promotionOfferTypes)[number]

function n(v: FormDataEntryValue | null): number | undefined {
  const s = String(v ?? '').trim()
  if (!s) return undefined
  const x = Number(s)
  return Number.isFinite(x) ? x : undefined
}

function date(v: FormDataEntryValue | null): Date | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

// Builds the type-specific config + a flat displayValue from the submitted
// fields. Each offer type reads only the inputs relevant to it.
function buildConfig(type: OfferType, fd: FormData): { config: unknown; displayValue?: number } {
  switch (type) {
    case 'product_discount': {
      const discountType = String(fd.get('discountType') ?? 'percentage')
      const value = n(fd.get('value')) ?? 0
      return { config: { discountType, value }, displayValue: value }
    }
    case 'fixed_price': {
      const minQty = n(fd.get('minQty')) ?? 1
      const specialPrice = n(fd.get('specialPrice')) ?? 0
      return { config: { minQty, specialPrice }, displayValue: specialPrice }
    }
    case 'quantity_tiers': {
      const minQty = n(fd.get('tierMinQty')) ?? 1
      const discountPct = n(fd.get('tierDiscountPct')) ?? 0
      return { config: { tiers: [{ minQty, discountPct }] }, displayValue: discountPct }
    }
    case 'buy_x_get_y': {
      const buyQty = n(fd.get('buyQty')) ?? 1
      const getQty = n(fd.get('getQty')) ?? 1
      const getDiscountPct = n(fd.get('getDiscountPct')) ?? 100
      return { config: { buyQty, getQty, getDiscountPct }, displayValue: getDiscountPct }
    }
    case 'loyalty_tier': {
      const tier = String(fd.get('tier') ?? 'silver')
      const discountPct = n(fd.get('loyaltyDiscountPct')) ?? 0
      return { config: { tier, discountPct }, displayValue: discountPct }
    }
  }
}

export async function createPromotionAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let ok = false
  try {
    const { context, tenantId } = await requireActionSession()
    assertRole(context, ['owner', 'accountant', 'branch_manager'])

    const name = String(formData.get('name') ?? '').trim()
    const offerType = String(formData.get('offerType') ?? '') as OfferType
    if (!name) return { ok: false, error: 'اسم العرض مطلوب.' }
    if (!promotionOfferTypes.includes(offerType)) return { ok: false, error: 'نوع العرض غير صالح.' }

    const { config, displayValue } = buildConfig(offerType, formData)

    const db = await getDb()
    await db.insert(promotions).values({
      tenantId,
      name,
      offerType,
      config: config as object,
      displayValue: displayValue != null ? String(displayValue) : null,
      startsAt: date(formData.get('startsAt')),
      expiresAt: date(formData.get('expiresAt')),
      isActive: true,
    })
    revalidatePath('/marketing/offers')
    ok = true
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'لا تملك صلاحية إنشاء عرض.' }
    return { ok: false, error: 'تعذّر حفظ العرض.' }
  }
  // redirect must be outside try/catch (it throws a control-flow signal).
  if (ok) redirect('/marketing/offers')
  return { ok }
}

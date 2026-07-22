'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { assertRole } from '@/lib/authz/service'
import { ForbiddenError } from '@/lib/authz/errors'
import { suppliers } from '@/db/schema'

export async function createSupplierAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    assertRole(context, ['owner', 'accountant', 'branch_manager'])

    const name = String(formData.get('name') ?? '').trim()
    if (!name) return { ok: false, error: 'اسم المورد مطلوب.' }

    const termsRaw = String(formData.get('paymentTermsDays') ?? '').trim()
    const db = await getDb()
    await db.insert(suppliers).values({
      tenantId,
      name,
      contactName: String(formData.get('contactName') ?? '').trim() || null,
      phone: String(formData.get('phone') ?? '').trim() || null,
      email: String(formData.get('email') ?? '').trim() || null,
      taxNumber: String(formData.get('taxNumber') ?? '').trim() || null,
      paymentTermsDays: termsRaw ? Number(termsRaw) : 0,
    })
    revalidatePath('/suppliers')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'لا تملك صلاحية إضافة مورد.' }
    return { ok: false, error: 'تعذّر حفظ المورد.' }
  }
}

'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { createCustomersService } from '@/lib/customers/service'
import { ForbiddenError } from '@/lib/authz/errors'

export async function createCustomerAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    const name = String(formData.get('name') ?? '').trim()
    if (!name) return { ok: false, error: 'الاسم مطلوب.' }

    const db = await getDb()
    await createCustomersService(db).createCustomer(context, {
      tenantId,
      name,
      phone: String(formData.get('phone') ?? '').trim() || undefined,
      email: String(formData.get('email') ?? '').trim() || undefined,
      notes: String(formData.get('notes') ?? '').trim() || undefined,
    })
    revalidatePath('/customers')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'لا تملك صلاحية إضافة عميل.' }
    return { ok: false, error: 'تعذّر حفظ العميل. تأكد من البيانات وحاول مجدداً.' }
  }
}

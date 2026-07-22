'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { assertRole } from '@/lib/authz/service'
import { ForbiddenError } from '@/lib/authz/errors'
import { branches } from '@/db/schema'

const BRANCH_TYPES = ['physical', 'online', 'warehouse'] as const

export async function createBranchAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    // Branches are structural — only the owner defines them.
    assertRole(context, ['owner'])

    const name = String(formData.get('name') ?? '').trim()
    const code = String(formData.get('code') ?? '').trim()
    const type = String(formData.get('type') ?? '') as (typeof BRANCH_TYPES)[number]
    if (!name || !code) return { ok: false, error: 'الاسم والرمز مطلوبان.' }
    if (!BRANCH_TYPES.includes(type)) return { ok: false, error: 'نوع الفرع غير صالح.' }

    const db = await getDb()
    await db.insert(branches).values({
      tenantId,
      name,
      code,
      type,
      accountingCode: String(formData.get('accountingCode') ?? '').trim() || null,
    })
    revalidatePath('/branches')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'صلاحية إضافة الفروع للمالك فقط.' }
    return { ok: false, error: 'تعذّر حفظ الفرع. قد يكون الرمز مستخدماً مسبقاً.' }
  }
}

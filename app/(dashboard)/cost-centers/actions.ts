'use server'

import { revalidatePath } from 'next/cache'
import { eq, and } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { assertRole } from '@/lib/authz/service'
import { ForbiddenError } from '@/lib/authz/errors'
import { costCenters } from '@/db/schema'

export async function createCostCenterAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    assertRole(context, ['owner', 'accountant'])

    const code = String(formData.get('code') ?? '').trim()
    const name = String(formData.get('name') ?? '').trim()
    if (!code || !name) return { ok: false, error: 'الرمز والاسم مطلوبان.' }

    const db = await getDb()
    const [existing] = await db
      .select({ id: costCenters.id })
      .from(costCenters)
      .where(and(eq(costCenters.tenantId, tenantId), eq(costCenters.code, code)))
      .limit(1)
    if (existing) return { ok: false, error: `الرمز ${code} مستخدم مسبقاً.` }

    await db.insert(costCenters).values({
      tenantId,
      code,
      name,
      description: String(formData.get('description') ?? '').trim() || null,
    })
    revalidatePath('/cost-centers')
    revalidatePath('/expenses')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'صلاحية مراكز التكلفة للمالك/المحاسب.' }
    return { ok: false, error: 'تعذّر حفظ مركز التكلفة.' }
  }
}

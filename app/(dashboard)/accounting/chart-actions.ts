'use server'

import { revalidatePath } from 'next/cache'
import { eq, and } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { assertRole } from '@/lib/authz/service'
import { ForbiddenError } from '@/lib/authz/errors'
import { seedDefaultChartOfAccounts } from '@/lib/accounting/defaults'
import { chartOfAccounts } from '@/db/schema'

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const

// Tops up the tenant's chart with any default accounts it's missing — for
// tenants provisioned before newer defaults (e.g. the full operating-expense
// set) were added. Idempotent: existing codes/mappings are left alone.
export async function ensureDefaultAccountsAction(
  _prev: ActionState,
  _formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    assertRole(context, ['owner', 'accountant'])
    const db = await getDb()
    const { accountsCreated } = await seedDefaultChartOfAccounts(db, tenantId)
    revalidatePath('/accounting')
    revalidatePath('/expenses')
    return {
      ok: true,
      error: accountsCreated === 0 ? 'الشجرة مكتملة — لا حسابات ناقصة.' : undefined,
    }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'صلاحية الشجرة للمالك/المحاسب.' }
    return { ok: false, error: 'تعذّر استكمال الحسابات.' }
  }
}

export async function createAccountAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    assertRole(context, ['owner', 'accountant'])

    const code = String(formData.get('code') ?? '').trim()
    const name = String(formData.get('name') ?? '').trim()
    const type = String(formData.get('type') ?? '') as (typeof ACCOUNT_TYPES)[number]
    if (!code || !name) return { ok: false, error: 'الرمز والاسم مطلوبان.' }
    if (!ACCOUNT_TYPES.includes(type)) return { ok: false, error: 'نوع الحساب غير صالح.' }

    const db = await getDb()
    const [existing] = await db
      .select({ id: chartOfAccounts.id })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.tenantId, tenantId), eq(chartOfAccounts.code, code)))
      .limit(1)
    if (existing) return { ok: false, error: `الرمز ${code} مستخدم مسبقاً.` }

    await db.insert(chartOfAccounts).values({ tenantId, code, name, type })
    revalidatePath('/accounting')
    revalidatePath('/expenses')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'صلاحية الشجرة للمالك/المحاسب.' }
    return { ok: false, error: 'تعذّر حفظ الحساب.' }
  }
}

'use server'

import { revalidatePath } from 'next/cache'
import { eq, and } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { assertRole } from '@/lib/authz/service'
import { ForbiddenError } from '@/lib/authz/errors'
import { bankAccounts, chartOfAccounts } from '@/db/schema'

function str(v: FormDataEntryValue | null): string | undefined {
  const s = String(v ?? '').trim()
  return s || undefined
}

export async function createBankAccountAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    assertRole(context, ['owner', 'accountant'])

    const bankName = String(formData.get('bankName') ?? '').trim()
    if (!bankName) return { ok: false, error: 'اسم البنك مطلوب.' }

    const db = await getDb()
    let chartAccountId = str(formData.get('chartAccountId'))

    // No existing chart account picked → create one under assets so the bank
    // always has a real ledger account behind it.
    if (!chartAccountId) {
      const code = String(formData.get('newAccountCode') ?? '').trim()
      if (!code) return { ok: false, error: 'اختر حساباً من الشجرة أو أدخل رمزاً لحساب جديد.' }
      const [existing] = await db
        .select({ id: chartOfAccounts.id })
        .from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.tenantId, tenantId), eq(chartOfAccounts.code, code)))
        .limit(1)
      if (existing) return { ok: false, error: `الرمز ${code} مستخدم مسبقاً في الشجرة.` }
      const [created] = await db
        .insert(chartOfAccounts)
        .values({ tenantId, code, name: `بنك ${bankName}`, type: 'asset' })
        .returning({ id: chartOfAccounts.id })
      chartAccountId = created.id
    }

    await db.insert(bankAccounts).values({
      tenantId,
      bankName,
      accountName: str(formData.get('accountName')),
      accountNumber: str(formData.get('accountNumber')),
      iban: str(formData.get('iban')),
      swift: str(formData.get('swift')),
      currency: str(formData.get('currency')) ?? 'SAR',
      chartAccountId,
      notes: str(formData.get('notes')),
    })
    revalidatePath('/banks')
    revalidatePath('/accounting')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'صلاحية إدارة البنوك للمالك/المحاسب.' }
    return { ok: false, error: 'تعذّر حفظ الحساب البنكي.' }
  }
}

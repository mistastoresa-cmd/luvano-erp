'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { createAccountingService } from '@/lib/accounting/service'
import { ForbiddenError } from '@/lib/authz/errors'
import type { AccountMappingKey } from '@/lib/accounting/types'

interface RawLine {
  accountKey?: string
  debit?: string
  credit?: string
  description?: string
}

export async function createJournalEntryAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let ok = false
  try {
    const { context, tenantId } = await requireActionSession()
    const entryDateRaw = String(formData.get('entryDate') ?? '').trim()
    if (!entryDateRaw) return { ok: false, error: 'تاريخ القيد مطلوب.' }
    const entryDate = new Date(entryDateRaw)
    if (Number.isNaN(entryDate.getTime())) return { ok: false, error: 'تاريخ القيد غير صالح.' }

    let raw: RawLine[] = []
    try {
      raw = JSON.parse(String(formData.get('linesJson') ?? '[]'))
    } catch {
      return { ok: false, error: 'بيانات البنود غير صالحة.' }
    }

    const lines = []
    let totalDebit = 0
    let totalCredit = 0
    for (const [i, l] of raw.entries()) {
      const accountKey = (l.accountKey ?? '').trim()
      if (!accountKey) return { ok: false, error: `البند ${i + 1}: اختر الحساب.` }
      const debit = Number(l.debit ?? 0) || 0
      const credit = Number(l.credit ?? 0) || 0
      if (debit < 0 || credit < 0) return { ok: false, error: `البند ${i + 1}: قيمة سالبة.` }
      if (debit === 0 && credit === 0)
        return { ok: false, error: `البند ${i + 1}: أدخل مديناً أو دائناً.` }
      if (debit > 0 && credit > 0)
        return { ok: false, error: `البند ${i + 1}: لا يمكن أن يكون مديناً ودائناً معاً.` }
      totalDebit += debit
      totalCredit += credit
      lines.push({
        accountKey: accountKey as AccountMappingKey,
        debit: debit || undefined,
        credit: credit || undefined,
        description: l.description?.trim() || undefined,
      })
    }
    if (lines.length < 2) return { ok: false, error: 'القيد يحتاج بندين على الأقل.' }

    // The double-entry invariant, checked before hitting the service so the
    // user gets a clear Arabic message instead of a generic service error.
    if (Math.round((totalDebit - totalCredit) * 100) !== 0) {
      return {
        ok: false,
        error: `القيد غير متوازن: المدين ${totalDebit.toFixed(2)} ≠ الدائن ${totalCredit.toFixed(2)}.`,
      }
    }

    const db = await getDb()
    await createAccountingService(db).postJournalEntry(context, {
      tenantId,
      entryDate,
      sourceType: 'manual',
      description: String(formData.get('description') ?? '').trim() || undefined,
      lines,
    })
    revalidatePath('/accounting')
    ok = true
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'لا تملك صلاحية إنشاء قيد.' }
    return { ok: false, error: 'تعذّر حفظ القيد. تأكد من ربط الحسابات.' }
  }
  if (ok) redirect('/accounting')
  return { ok }
}

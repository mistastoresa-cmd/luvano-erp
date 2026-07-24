'use server'

import { revalidatePath } from 'next/cache'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { createExpensesService } from '@/lib/expenses/service'
import { ForbiddenError } from '@/lib/authz/errors'
import { expenses, type PaymentMethod, paymentMethods } from '@/db/schema'

function str(v: FormDataEntryValue | null): string | undefined {
  const s = String(v ?? '').trim()
  return s || undefined
}

async function nextExpenseNumber(db: Awaited<ReturnType<typeof getDb>>, tenantId: string) {
  const [row] = await db
    .select({ count: sql<string>`count(*)` })
    .from(expenses)
    .where(eq(expenses.tenantId, tenantId))
  return `EXP-${String(Number(row?.count ?? 0) + 1).padStart(4, '0')}`
}

export async function createExpenseAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()

    const expenseAccountId = str(formData.get('expenseAccountId'))
    const expenseDate = str(formData.get('expenseDate'))
    const amount = Number(formData.get('amount'))
    const paymentMethod = String(formData.get('paymentMethod') ?? '') as PaymentMethod

    if (!expenseAccountId) return { ok: false, error: 'اختر حساب المصروف.' }
    if (!expenseDate) return { ok: false, error: 'تاريخ المصروف مطلوب.' }
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'المبلغ غير صالح.' }
    if (!paymentMethods.includes(paymentMethod)) return { ok: false, error: 'طريقة الدفع غير صالحة.' }

    const bankAccountId = str(formData.get('bankAccountId'))
    if ((paymentMethod === 'bank' || paymentMethod === 'cheque') && !bankAccountId) {
      return { ok: false, error: 'الدفع بنكي/شيك يتطلب اختيار الحساب البنكي.' }
    }

    const db = await getDb()
    const svc = createExpensesService(db)
    const { expenseId } = await svc.createExpense(context, {
      tenantId,
      branchId: str(formData.get('branchId')),
      expenseNumber: await nextExpenseNumber(db, tenantId),
      expenseDate,
      expenseAccountId,
      amount,
      taxAmount: Number(formData.get('taxAmount')) || 0,
      description: str(formData.get('description')),
      paymentMethod,
      bankAccountId,
      chequeNumber: str(formData.get('chequeNumber')),
      chequeDueDate: str(formData.get('chequeDueDate')),
      beneficiary: str(formData.get('beneficiary')),
    })

    // Post immediately when asked — otherwise it stays a draft the accountant
    // reviews and posts from the list.
    if (formData.get('postNow') != null) {
      await svc.postExpenseJournal(context, tenantId, expenseId)
    }

    revalidatePath('/expenses')
    revalidatePath('/accounting')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'لا تملك صلاحية تسجيل مصروف.' }
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('No account_mappings')) {
      return { ok: false, error: 'ربط الحسابات ناقص — تأكد من شجرة الحسابات.' }
    }
    return { ok: false, error: 'تعذّر حفظ المصروف.' }
  }
}

export async function postExpenseAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    const expenseId = String(formData.get('expenseId') ?? '')
    const db = await getDb()
    await createExpensesService(db).postExpenseJournal(context, tenantId, expenseId)
    revalidatePath('/expenses')
    revalidatePath('/accounting')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'الترحيل للمالك/المحاسب فقط.' }
    return { ok: false, error: 'تعذّر ترحيل المصروف.' }
  }
}

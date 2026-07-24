'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { createAccountingService } from '@/lib/accounting/service'
import { assertRole } from '@/lib/authz/service'
import { ForbiddenError } from '@/lib/authz/errors'
import { supplierPayments } from '@/db/schema'

const METHODS = ['cash', 'bank_transfer', 'card', 'cheque'] as const
type Method = (typeof METHODS)[number]

function str(v: FormDataEntryValue | null): string | undefined {
  const s = String(v ?? '').trim()
  return s || undefined
}

export async function createSupplierPaymentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    assertRole(context, ['owner', 'accountant', 'branch_manager'])

    const supplierId = str(formData.get('supplierId'))
    const paymentDate = str(formData.get('paymentDate'))
    const amount = Number(formData.get('amount'))
    const method = String(formData.get('method') ?? '') as Method
    if (!supplierId) return { ok: false, error: 'اختر المورد.' }
    if (!paymentDate) return { ok: false, error: 'تاريخ الدفعة مطلوب.' }
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'المبلغ غير صالح.' }
    if (!METHODS.includes(method)) return { ok: false, error: 'طريقة الدفع غير صالحة.' }

    const bankAccountId = str(formData.get('bankAccountId'))
    if ((method === 'bank_transfer' || method === 'cheque') && !bankAccountId) {
      return { ok: false, error: 'التحويل البنكي/الشيك يتطلب اختيار الحساب البنكي.' }
    }

    const db = await getDb()
    const [row] = await db
      .insert(supplierPayments)
      .values({
        tenantId,
        supplierId,
        supplierInvoiceId: str(formData.get('supplierInvoiceId')),
        branchId: str(formData.get('branchId')),
        amount: amount.toFixed(2),
        paymentDate,
        method,
        reference: str(formData.get('reference')),
        bankAccountId,
        chequeNumber: str(formData.get('chequeNumber')),
        chequeDueDate: str(formData.get('chequeDueDate')),
      })
      .returning({ id: supplierPayments.id })

    if (formData.get('postNow') != null) {
      await createAccountingService(db).postSupplierPaymentJournal(context, tenantId, row.id)
    }

    revalidatePath('/supplier-payments')
    revalidatePath('/accounting')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'لا تملك صلاحية تسجيل دفعة.' }
    return { ok: false, error: 'تعذّر حفظ الدفعة.' }
  }
}

export async function postSupplierPaymentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    const db = await getDb()
    await createAccountingService(db).postSupplierPaymentJournal(
      context,
      tenantId,
      String(formData.get('paymentId') ?? '')
    )
    revalidatePath('/supplier-payments')
    revalidatePath('/accounting')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'الترحيل للمالك/المحاسب فقط.' }
    return { ok: false, error: 'تعذّر ترحيل الدفعة.' }
  }
}

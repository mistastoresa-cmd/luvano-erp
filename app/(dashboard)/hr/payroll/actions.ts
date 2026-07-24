'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { createHrService } from '@/lib/hr/service'
import { ForbiddenError } from '@/lib/authz/errors'

export async function createPayrollRunAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    const periodStart = String(formData.get('periodStart') ?? '').trim()
    const periodEnd = String(formData.get('periodEnd') ?? '').trim()
    if (!periodStart || !periodEnd) return { ok: false, error: 'فترة الرواتب مطلوبة.' }
    if (periodEnd < periodStart) return { ok: false, error: 'نهاية الفترة قبل بدايتها.' }

    const db = await getDb()
    await createHrService(db).createPayrollRun(context, { tenantId, periodStart, periodEnd })
    revalidatePath('/hr/payroll')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'صلاحية الرواتب للمالك/المحاسب.' }
    return { ok: false, error: 'تعذّر إنشاء مسيّر الرواتب.' }
  }
}

export async function processPayrollAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    const db = await getDb()
    await createHrService(db).processPayrollRun(
      context,
      tenantId,
      String(formData.get('payrollRunId') ?? '')
    )
    revalidatePath('/hr/payroll')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'صلاحية الرواتب للمالك/المحاسب.' }
    const msg = err instanceof Error ? err.message : ''
    return { ok: false, error: msg || 'تعذّر احتساب الرواتب.' }
  }
}

export async function postPayrollAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    const db = await getDb()
    await createHrService(db).postPayrollJournal(
      context,
      tenantId,
      String(formData.get('payrollRunId') ?? '')
    )
    revalidatePath('/hr/payroll')
    revalidatePath('/accounting')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'الترحيل للمالك/المحاسب فقط.' }
    const msg = err instanceof Error ? err.message : ''
    return { ok: false, error: msg || 'تعذّر ترحيل الرواتب.' }
  }
}

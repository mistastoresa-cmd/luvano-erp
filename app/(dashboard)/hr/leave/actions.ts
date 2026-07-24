'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { createLeaveService } from '@/lib/leave/service'
import { ForbiddenError } from '@/lib/authz/errors'
import type { LeaveType } from '@/lib/leave/types'

const LEAVE_TYPES = ['annual', 'sick', 'unpaid', 'maternity', 'other'] as const

export async function createLeaveAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    const employeeId = String(formData.get('employeeId') ?? '')
    const leaveType = String(formData.get('leaveType') ?? '') as LeaveType
    const startDate = String(formData.get('startDate') ?? '').trim()
    const endDate = String(formData.get('endDate') ?? '').trim()
    if (!employeeId) return { ok: false, error: 'اختر الموظف.' }
    if (!LEAVE_TYPES.includes(leaveType as (typeof LEAVE_TYPES)[number]))
      return { ok: false, error: 'نوع الإجازة غير صالح.' }
    if (!startDate || !endDate) return { ok: false, error: 'تاريخا البداية والنهاية مطلوبان.' }
    if (endDate < startDate) return { ok: false, error: 'تاريخ النهاية قبل البداية.' }

    const db = await getDb()
    await createLeaveService(db).createLeaveRequest(context, {
      tenantId,
      employeeId,
      leaveType,
      startDate,
      endDate,
      reason: String(formData.get('reason') ?? '').trim() || undefined,
    })
    revalidatePath('/hr/leave')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'لا تملك صلاحية تقديم إجازة.' }
    const msg = err instanceof Error ? err.message : ''
    return { ok: false, error: msg || 'تعذّر حفظ طلب الإجازة.' }
  }
}

async function decide(formData: FormData, approve: boolean): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    const id = String(formData.get('leaveRequestId') ?? '')
    const db = await getDb()
    const svc = createLeaveService(db)
    if (approve) await svc.approveLeaveRequest(context, tenantId, id)
    else await svc.rejectLeaveRequest(context, tenantId, id)
    revalidatePath('/hr/leave')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'الاعتماد لمدير/مالك فقط.' }
    return { ok: false, error: 'تعذّر تنفيذ الإجراء.' }
  }
}

export async function approveLeaveAction(_prev: ActionState, formData: FormData) {
  return decide(formData, true)
}
export async function rejectLeaveAction(_prev: ActionState, formData: FormData) {
  return decide(formData, false)
}

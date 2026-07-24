'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { createTasksService } from '@/lib/employee-tasks/service'
import { ForbiddenError } from '@/lib/authz/errors'
import type { TaskStatus } from '@/lib/employee-tasks/types'

const STATUSES = ['pending', 'in_progress', 'done', 'cancelled'] as const

export async function assignTaskAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId, userId } = await requireActionSession()
    const employeeId = String(formData.get('employeeId') ?? '')
    const title = String(formData.get('title') ?? '').trim()
    if (!employeeId) return { ok: false, error: 'اختر الموظف.' }
    if (!title) return { ok: false, error: 'عنوان المهمة مطلوب.' }

    const db = await getDb()
    await createTasksService(db).assignTask(context, {
      tenantId,
      employeeId,
      title,
      description: String(formData.get('description') ?? '').trim() || undefined,
      dueDate: String(formData.get('dueDate') ?? '').trim() || undefined,
      assignedBy: userId,
    })
    revalidatePath('/hr/tasks')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'لا تملك صلاحية إسناد مهام.' }
    return { ok: false, error: 'تعذّر حفظ المهمة.' }
  }
}

export async function updateTaskStatusAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    const status = String(formData.get('status') ?? '') as TaskStatus
    if (!STATUSES.includes(status as (typeof STATUSES)[number]))
      return { ok: false, error: 'حالة غير صالحة.' }

    const db = await getDb()
    await createTasksService(db).updateTaskStatus(
      context,
      tenantId,
      String(formData.get('taskId') ?? ''),
      status
    )
    revalidatePath('/hr/tasks')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'لا تملك صلاحية تعديل المهمة.' }
    return { ok: false, error: 'تعذّر تحديث الحالة.' }
  }
}

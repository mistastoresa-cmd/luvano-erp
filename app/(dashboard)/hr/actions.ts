'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { createEmployeesService } from '@/lib/employees/service'
import { ForbiddenError } from '@/lib/authz/errors'

export async function createEmployeeAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    const name = String(formData.get('name') ?? '').trim()
    const hireDate = String(formData.get('hireDate') ?? '').trim()
    const baseSalaryRaw = String(formData.get('baseSalary') ?? '').trim()
    if (!name) return { ok: false, error: 'اسم الموظف مطلوب.' }
    if (!hireDate) return { ok: false, error: 'تاريخ التعيين مطلوب.' }
    const baseSalary = Number(baseSalaryRaw)
    if (!Number.isFinite(baseSalary) || baseSalary < 0)
      return { ok: false, error: 'الراتب الأساسي غير صالح.' }

    const db = await getDb()
    await createEmployeesService(db).createEmployee(context, {
      tenantId,
      name,
      hireDate,
      baseSalary,
      jobTitle: String(formData.get('jobTitle') ?? '').trim() || undefined,
      department: String(formData.get('department') ?? '').trim() || undefined,
      phone: String(formData.get('phone') ?? '').trim() || undefined,
      email: String(formData.get('email') ?? '').trim() || undefined,
      nationalId: String(formData.get('nationalId') ?? '').trim() || undefined,
      ibanNumber: String(formData.get('ibanNumber') ?? '').trim() || undefined,
    })
    revalidatePath('/hr')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'لا تملك صلاحية إضافة موظف.' }
    return { ok: false, error: 'تعذّر حفظ الموظف. تأكد من البيانات.' }
  }
}

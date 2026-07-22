'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { createProductsService } from '@/lib/products/service'
import { ForbiddenError } from '@/lib/authz/errors'

export async function createProductAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    const name = String(formData.get('name') ?? '').trim()
    const sku = String(formData.get('sku') ?? '').trim()
    if (!name || !sku) return { ok: false, error: 'الاسم و SKU مطلوبان.' }

    const db = await getDb()
    // A simple product = one variant carrying the SKU (see CreateProductInput).
    await createProductsService(db).createProduct(context, {
      tenantId,
      name,
      category: String(formData.get('category') ?? '').trim() || undefined,
      variants: [{ sku }],
    })
    revalidatePath('/products')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'لا تملك صلاحية إضافة منتج.' }
    return { ok: false, error: 'تعذّر حفظ المنتج. قد يكون SKU مستخدماً مسبقاً.' }
  }
}

'use server'

import { revalidatePath } from 'next/cache'
import { put } from '@vercel/blob'
import { getDb } from '@/db/client'
import { requireActionSession, type ActionState } from '@/lib/authz/action-session'
import { createProductsService } from '@/lib/products/service'
import { ForbiddenError } from '@/lib/authz/errors'
import type { CreateProductVariantInput } from '@/lib/products/types'

// Uploads the product image to Vercel Blob and returns its public URL.
// Returns undefined when there's no file, or when Blob isn't configured
// (local dev without a token) — the product still saves, just without an
// image, rather than failing the whole create.
async function uploadProductImage(
  file: FormDataEntryValue | null,
  tenantId: string
): Promise<string | undefined> {
  if (!(file instanceof File) || file.size === 0) return undefined
  if (!process.env.BLOB_READ_WRITE_TOKEN) return undefined
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const blob = await put(`products/${tenantId}/${Date.now()}-${safeName}`, file, {
    access: 'public',
    addRandomSuffix: true,
  })
  return blob.url
}

function str(v: FormDataEntryValue | null): string | undefined {
  const s = String(v ?? '').trim()
  return s || undefined
}

// One row from the client's dynamic variant list (product-card-dialog.tsx),
// submitted as a JSON string in the hidden `variantsJson` field.
interface RawVariant {
  sku?: string
  barcode?: string
  attribute?: string
  costPrice?: string
  sellPrice?: string
  reorderLevel?: string
}

function toNum(s: string | undefined): number | undefined {
  if (!s || !s.trim()) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

export async function createProductAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { context, tenantId } = await requireActionSession()
    const name = String(formData.get('name') ?? '').trim()
    if (!name) return { ok: false, error: 'اسم الصنف مطلوب.' }

    const taxable = formData.get('taxable') != null

    let raw: RawVariant[] = []
    try {
      raw = JSON.parse(String(formData.get('variantsJson') ?? '[]'))
    } catch {
      return { ok: false, error: 'بيانات المتغيرات غير صالحة.' }
    }
    if (!Array.isArray(raw) || raw.length === 0) {
      return { ok: false, error: 'أضف متغيّراً واحداً على الأقل (برمز SKU).' }
    }

    const variants: CreateProductVariantInput[] = []
    for (const [i, v] of raw.entries()) {
      const sku = (v.sku ?? '').trim()
      if (!sku) return { ok: false, error: `المتغيّر رقم ${i + 1}: رمز SKU مطلوب.` }
      variants.push({
        sku,
        barcode: v.barcode?.trim() || undefined,
        costPrice: toNum(v.costPrice),
        sellPrice: toNum(v.sellPrice),
        taxable,
        reorderLevel: toNum(v.reorderLevel) ?? 0,
        attributes: v.attribute?.trim() ? { variant: v.attribute.trim() } : {},
      })
    }

    const imageUrl = await uploadProductImage(formData.get('image'), tenantId)

    const db = await getDb()
    await createProductsService(db).createProduct(context, {
      tenantId,
      name,
      nameEn: str(formData.get('nameEn')),
      category: str(formData.get('category')),
      brand: str(formData.get('brand')),
      unit: str(formData.get('unit')) ?? 'piece',
      description: str(formData.get('description')),
      imageUrl,
      variants,
    })
    revalidatePath('/products')
    return { ok: true }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'لا تملك صلاحية إضافة منتج.' }
    return { ok: false, error: 'تعذّر حفظ الصنف. قد يكون أحد رموز SKU مستخدماً مسبقاً.' }
  }
}

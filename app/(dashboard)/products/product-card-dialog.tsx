'use client'

import { useActionState, useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Plus, X, Tag, Stack, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ActionState } from '@/lib/authz/action-session'
import { createProductAction } from './actions'
import { ImageDropzone } from './image-dropzone'

const UNITS = [
  { value: 'piece', label: 'قطعة' },
  { value: 'ml', label: 'مل' },
  { value: 'gram', label: 'جرام' },
  { value: 'box', label: 'علبة' },
  { value: 'pack', label: 'عبوة' },
]

interface VariantRow {
  id: number
  attribute: string
  sku: string
  skuTouched: boolean
  barcode: string
  costPrice: string
  sellPrice: string
  reorderLevel: string
}

function emptyVariant(id: number): VariantRow {
  return {
    id,
    attribute: '',
    sku: '',
    skuTouched: false,
    barcode: '',
    costPrice: '',
    sellPrice: '',
    reorderLevel: '',
  }
}

// The auto SKU for a variant that the user hasn't manually overridden:
// parent base code + sequence suffix (base-1, base-2…). A single-variant
// (simple) product just uses the base code as-is.
function autoSku(base: string, idx: number, count: number): string {
  const b = base.trim()
  if (!b) return ''
  return count > 1 ? `${b}-${idx + 1}` : b
}

function resolveSku(v: VariantRow, base: string, idx: number, count: number): string {
  return v.skuTouched ? v.sku : autoSku(base, idx, count)
}

function Field({
  name,
  label,
  type = 'text',
  required,
  placeholder,
}: {
  name: string
  label: string
  type?: string
  required?: boolean
  placeholder?: string
}) {
  return (
    <div>
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-danger-600"> *</span>}
      </Label>
      <Input id={name} name={name} type={type} required={required} placeholder={placeholder} />
    </div>
  )
}

export function ProductCardDialog() {
  const [open, setOpen] = useState(false)
  const [nextId, setNextId] = useState(2)
  const [baseSku, setBaseSku] = useState('')
  const [variants, setVariants] = useState<VariantRow[]>([emptyVariant(1)])
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createProductAction, {
    ok: false,
  })

  useEffect(() => {
    if (state.ok) {
      setOpen(false)
      setBaseSku('')
      setVariants([emptyVariant(1)])
      setImageFile(null)
      setNextId(2)
    }
  }, [state.ok])

  function updateVariant(id: number, patch: Partial<VariantRow>) {
    setVariants((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function addVariant() {
    setVariants((rows) => [...rows, emptyVariant(nextId)])
    setNextId((n) => n + 1)
  }
  function removeVariant(id: number) {
    setVariants((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows))
  }

  const count = variants.length
  const isMulti = count > 1

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button>
          <Plus size={16} weight="bold" />
          إضافة صنف
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed start-1/2 top-1/2 z-50 max-h-[90dvh] w-[94vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-5 shadow-xl rtl:translate-x-1/2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold text-[color:var(--text-primary)]">
                كرت صنف جديد
              </Dialog.Title>
              <p className="text-xs text-[color:var(--text-tertiary)]">
                منتج رئيسي واحد + متغيّر أو أكثر (أحجام/ألوان) — رموز المتغيرات تُشتق تلقائياً من الرمز الأساسي
              </p>
            </div>
            <Dialog.Close className="rounded-md p-1 text-[color:var(--text-tertiary)] hover:bg-[color:var(--surface-sunken)]">
              <X size={18} />
            </Dialog.Close>
          </div>

          <form
            action={(fd) => {
              // Resolve each variant's effective SKU (auto or overridden) and
              // serialize into the hidden field the Server Action parses.
              const resolved = variants.map((v, idx) => ({
                ...v,
                sku: resolveSku(v, baseSku, idx, count),
              }))
              fd.set('variantsJson', JSON.stringify(resolved))
              if (imageFile) fd.set('image', imageFile)
              return formAction(fd)
            }}
            className="space-y-4"
          >
            {/* Product-level (parent) fields — shared across all variants */}
            <div className="rounded-lg border border-[color:var(--border-subtle)] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[color:var(--text-secondary)]">
                <span className="text-accent-600">
                  <Tag size={16} weight="bold" />
                </span>
                المنتج الرئيسي
              </div>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <Field name="name" label="اسم المنتج" required placeholder="عود ملكي فاخر" />
                <Field name="nameEn" label="الاسم بالإنجليزية" placeholder="Royal Oud" />
                <div>
                  <Label htmlFor="baseSku">
                    الرمز الأساسي (Base SKU)<span className="text-danger-600"> *</span>
                  </Label>
                  <Input
                    id="baseSku"
                    value={baseSku}
                    onChange={(e) => setBaseSku(e.target.value)}
                    placeholder="MISTA-OUD"
                    required
                  />
                  <p className="mt-1 text-[11px] text-[color:var(--text-tertiary)]">
                    تُشتق منه رموز المتغيرات: {baseSku ? `${baseSku}-1، ${baseSku}-2…` : 'مثال: MISTA-OUD-1'}
                  </p>
                </div>
                <Field name="category" label="التصنيف" placeholder="عطور رجالية" />
                <Field name="brand" label="العلامة التجارية" placeholder="ميستا" />
                <div>
                  <Label htmlFor="unit">وحدة القياس</Label>
                  <select
                    id="unit"
                    name="unit"
                    defaultValue="piece"
                    className="mt-1 h-9 w-full rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface)] px-3 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent-500"
                  >
                    {UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Field name="description" label="الوصف" placeholder="وصف مختصر" />
                <label className="flex items-center gap-2 pt-1 text-sm text-[color:var(--text-secondary)] sm:col-span-2">
                  <input
                    type="checkbox"
                    name="taxable"
                    defaultChecked
                    className="size-4 rounded border-[color:var(--border-default)] accent-accent-600"
                  />
                  خاضع لضريبة القيمة المضافة (15%)
                </label>
                <div className="sm:col-span-2">
                  <Label>صورة المنتج</Label>
                  <div className="mt-1">
                    <ImageDropzone onFile={setImageFile} />
                  </div>
                </div>
              </div>
            </div>

            {/* Variant-level (children) — dynamic list */}
            <div className="rounded-lg border border-[color:var(--border-subtle)] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--text-secondary)]">
                  <span className="text-accent-600">
                    <Stack size={16} weight="bold" />
                  </span>
                  المتغيرات (الأصناف الفرعية)
                </div>
                <Button type="button" variant="secondary" onClick={addVariant} className="h-8 px-2.5 text-xs">
                  <Plus size={14} weight="bold" />
                  إضافة متغيّر
                </Button>
              </div>

              <div className="space-y-3">
                {variants.map((v, idx) => {
                  const skuValue = resolveSku(v, baseSku, idx, count)
                  return (
                    <div
                      key={v.id}
                      className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)] p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-[color:var(--text-tertiary)]">
                          متغيّر #{idx + 1}
                        </span>
                        {isMulti && (
                          <button
                            type="button"
                            onClick={() => removeVariant(v.id)}
                            className="rounded p-1 text-danger-600 hover:bg-danger-500/10"
                            aria-label="حذف المتغيّر"
                          >
                            <Trash size={15} />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {isMulti && (
                          <div className="sm:col-span-2">
                            <Label>الخاصية (الحجم/اللون)</Label>
                            <Input
                              value={v.attribute}
                              onChange={(e) => updateVariant(v.id, { attribute: e.target.value })}
                              placeholder="مثال: 50 مل"
                            />
                          </div>
                        )}
                        <div>
                          <Label>
                            رمز SKU<span className="text-danger-600"> *</span>
                            <span className="mr-1 text-[10px] font-normal text-[color:var(--text-tertiary)]">
                              (تلقائي — قابل للتعديل)
                            </span>
                          </Label>
                          <Input
                            value={skuValue}
                            onChange={(e) =>
                              updateVariant(v.id, { sku: e.target.value, skuTouched: true })
                            }
                            placeholder="يُشتق من الرمز الأساسي"
                          />
                        </div>
                        <div>
                          <Label>الباركود</Label>
                          <Input
                            value={v.barcode}
                            onChange={(e) => updateVariant(v.id, { barcode: e.target.value })}
                            placeholder="6281000000000"
                          />
                        </div>
                        <div>
                          <Label>سعر التكلفة (ر.س)</Label>
                          <Input
                            type="number"
                            step="any"
                            value={v.costPrice}
                            onChange={(e) => updateVariant(v.id, { costPrice: e.target.value })}
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <Label>سعر البيع (ر.س)</Label>
                          <Input
                            type="number"
                            step="any"
                            value={v.sellPrice}
                            onChange={(e) => updateVariant(v.id, { sellPrice: e.target.value })}
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <Label>حد إعادة الطلب</Label>
                          <Input
                            type="number"
                            step="any"
                            value={v.reorderLevel}
                            onChange={(e) => updateVariant(v.id, { reorderLevel: e.target.value })}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="mt-2 text-[11px] text-[color:var(--text-tertiary)]">
                منتج بسيط؟ اترك متغيّراً واحداً (يأخذ الرمز الأساسي كما هو). منتج بأحجام؟ أضف متغيّراً لكل واحد.
              </p>
            </div>

            {state.error && (
              <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-600">
                {state.error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost">
                  إلغاء
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={pending}>
                {pending ? 'جارٍ الحفظ…' : 'حفظ الصنف'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

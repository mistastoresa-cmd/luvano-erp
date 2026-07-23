'use client'

import { useActionState, useState } from 'react'
import { ArrowRight } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { LineItemsEditor, emptyRow, type LineColumn, type LineRow } from '@/components/forms/line-items'
import type { ActionState } from '@/lib/authz/action-session'
import { createSaleInvoiceAction } from '../actions'

export interface CatalogItem {
  sku: string
  name: string
  sellPrice: string | null
}

function buildColumns(catalog: CatalogItem[]): LineColumn[] {
  const skuColumn: LineColumn =
    catalog.length > 0
      ? {
          key: 'sku',
          label: 'الصنف',
          type: 'select',
          span: 'sm:col-span-2',
          options: catalog.map((c) => ({
            value: c.sku,
            label: `${c.name} · ${c.sku}`,
            // Selecting a product fills its name + sell price automatically.
            patch: { productName: c.name, unitPrice: c.sellPrice ?? '' },
          })),
        }
      : { key: 'sku', label: 'رمز الصنف (SKU)', placeholder: 'MISTA-OUD-1' }

  return [
    skuColumn,
    { key: 'productName', label: 'اسم الصنف', placeholder: 'عود ملكي' },
    { key: 'quantity', label: 'الكمية', type: 'number', placeholder: '1' },
    { key: 'unitPrice', label: 'سعر الوحدة (ر.س)', type: 'number', placeholder: '320' },
    { key: 'tax', label: 'الضريبة (ر.س)', type: 'number', placeholder: '48' },
  ]
}

export function SaleInvoiceForm({
  branches,
  catalog,
}: {
  branches: { id: string; name: string }[]
  catalog: CatalogItem[]
}) {
  const COLUMNS = buildColumns(catalog)
  const [rows, setRows] = useState<LineRow[]>([emptyRow(1, COLUMNS)])
  const [nextId, setNextId] = useState(2)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createSaleInvoiceAction,
    { ok: false }
  )

  const subtotal = rows.reduce(
    (s, r) => s + (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0),
    0
  )
  const tax = rows.reduce((s, r) => s + (Number(r.tax) || 0), 0)
  const fmt = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <form
      action={(fd) => {
        fd.set('linesJson', JSON.stringify(rows))
        return formAction(fd)
      }}
      className="space-y-4"
    >
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="branchId">
              الفرع<span className="text-danger-600"> *</span>
            </Label>
            <select
              id="branchId"
              name="branchId"
              required
              className="mt-1 h-9 w-full rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface)] px-3 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent-500"
            >
              <option value="">اختر الفرع…</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="customerName">اسم العميل</Label>
            <Input id="customerName" name="customerName" placeholder="عميل نقدي" />
          </div>
          <div>
            <Label htmlFor="customerPhone">جوال العميل</Label>
            <Input id="customerPhone" name="customerPhone" type="tel" placeholder="05xxxxxxxx" />
          </div>
        </CardContent>
      </Card>

      <LineItemsEditor
        title="أصناف الفاتورة"
        columns={COLUMNS}
        rows={rows}
        onChange={setRows}
        nextId={nextId}
        onNextId={setNextId}
        footer={
          <div className="space-y-1.5 rounded-lg bg-[color:var(--surface-sunken)] px-3.5 py-2.5">
            <div className="flex items-center justify-between text-sm text-[color:var(--text-secondary)]">
              <span>الإجمالي قبل الضريبة</span>
              <span className="tabular-figures">{fmt(subtotal)} ر.س</span>
            </div>
            <div className="flex items-center justify-between text-sm text-[color:var(--text-secondary)]">
              <span>الضريبة</span>
              <span className="tabular-figures">{fmt(tax)} ر.س</span>
            </div>
            <div className="flex items-center justify-between border-t border-[color:var(--border-subtle)] pt-1.5 text-base font-bold text-[color:var(--text-primary)]">
              <span>الإجمالي</span>
              <span className="tabular-figures">{fmt(subtotal + tax)} ر.س</span>
            </div>
          </div>
        }
      />

      {state.error && (
        <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-600">{state.error}</p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'جارٍ الحفظ…' : 'حفظ الفاتورة'}
          <ArrowRight size={16} weight="bold" />
        </Button>
      </div>
    </form>
  )
}

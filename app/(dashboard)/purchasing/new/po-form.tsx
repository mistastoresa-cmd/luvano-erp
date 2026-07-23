'use client'

import { useActionState, useState } from 'react'
import { ArrowRight } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { LineItemsEditor, emptyRow, type LineColumn, type LineRow } from '@/components/forms/line-items'
import type { ActionState } from '@/lib/authz/action-session'
import { createPurchaseOrderAction } from '../actions'

const COLUMNS: LineColumn[] = [
  { key: 'sku', label: 'رمز الصنف (SKU)', placeholder: 'MISTA-OUD-1' },
  { key: 'productName', label: 'اسم الصنف', placeholder: 'عود ملكي' },
  { key: 'quantityOrdered', label: 'الكمية', type: 'number', placeholder: '10' },
  { key: 'unitCost', label: 'تكلفة الوحدة (ر.س)', type: 'number', placeholder: '150' },
]

export function PurchaseOrderForm({
  branches,
  suppliers,
}: {
  branches: { id: string; name: string }[]
  suppliers: { id: string; name: string }[]
}) {
  const [rows, setRows] = useState<LineRow[]>([emptyRow(1, COLUMNS)])
  const [nextId, setNextId] = useState(2)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createPurchaseOrderAction,
    { ok: false }
  )

  const total = rows.reduce(
    (s, r) => s + (Number(r.quantityOrdered) || 0) * (Number(r.unitCost) || 0),
    0
  )

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
            <Label htmlFor="supplierId">
              المورد<span className="text-danger-600"> *</span>
            </Label>
            <select
              id="supplierId"
              name="supplierId"
              required
              className="mt-1 h-9 w-full rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface)] px-3 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent-500"
            >
              <option value="">اختر المورد…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="orderDate">
              تاريخ الأمر<span className="text-danger-600"> *</span>
            </Label>
            <Input id="orderDate" name="orderDate" type="date" required />
          </div>
          <div>
            <Label htmlFor="expectedDate">الاستلام المتوقّع</Label>
            <Input id="expectedDate" name="expectedDate" type="date" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">ملاحظات</Label>
            <Input id="notes" name="notes" placeholder="ملاحظات على الأمر" />
          </div>
        </CardContent>
      </Card>

      <LineItemsEditor
        title="أصناف أمر الشراء"
        columns={COLUMNS}
        rows={rows}
        onChange={setRows}
        nextId={nextId}
        onNextId={setNextId}
        footer={
          <div className="flex items-center justify-between rounded-lg bg-[color:var(--surface-sunken)] px-3.5 py-2.5">
            <span className="text-sm font-medium text-[color:var(--text-secondary)]">
              إجمالي الأمر
            </span>
            <span className="tabular-figures text-base font-bold text-[color:var(--text-primary)]">
              {total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
            </span>
          </div>
        }
      />

      {state.error && (
        <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-600">{state.error}</p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'جارٍ الحفظ…' : 'حفظ أمر الشراء'}
          <ArrowRight size={16} weight="bold" />
        </Button>
      </div>
    </form>
  )
}

'use client'

import { useActionState, useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Plus, X, ArrowsLeftRight } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LineItemsEditor, emptyRow, type LineColumn, type LineRow } from '@/components/forms/line-items'
import type { ActionState } from '@/lib/authz/action-session'
import { createTransferAction } from './actions'

const COLUMNS: LineColumn[] = [
  { key: 'sku', label: 'رمز الصنف (SKU)', placeholder: 'MISTA-OUD-1' },
  { key: 'quantity', label: 'الكمية', type: 'number', placeholder: '5' },
]

export function NewTransferDialog({ branches }: { branches: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<LineRow[]>([emptyRow(1, COLUMNS)])
  const [nextId, setNextId] = useState(2)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createTransferAction, {
    ok: false,
  })

  useEffect(() => {
    if (state.ok) {
      setOpen(false)
      setRows([emptyRow(1, COLUMNS)])
      setNextId(2)
    }
  }, [state.ok])

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button>
          <Plus size={16} weight="bold" />
          تحويل جديد
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed start-1/2 top-1/2 z-50 max-h-[90dvh] w-[94vw] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-5 shadow-xl rtl:translate-x-1/2">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-[color:var(--text-primary)]">
              <ArrowsLeftRight size={18} className="text-accent-600" />
              تحويل مخزون بين فرعين
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-[color:var(--text-tertiary)] hover:bg-[color:var(--surface-sunken)]">
              <X size={18} />
            </Dialog.Close>
          </div>

          <form
            action={(fd) => {
              fd.set('linesJson', JSON.stringify(rows))
              return formAction(fd)
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <Label htmlFor="fromBranchId">
                  من فرع<span className="text-danger-600"> *</span>
                </Label>
                <select
                  id="fromBranchId"
                  name="fromBranchId"
                  required
                  className="mt-1 h-9 w-full rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface)] px-3 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent-500"
                >
                  <option value="">الفرع المُرسِل…</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="toBranchId">
                  إلى فرع<span className="text-danger-600"> *</span>
                </Label>
                <select
                  id="toBranchId"
                  name="toBranchId"
                  required
                  className="mt-1 h-9 w-full rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface)] px-3 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent-500"
                >
                  <option value="">الفرع المستلم…</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="notes">ملاحظات</Label>
                <Input id="notes" name="notes" placeholder="سبب التحويل" />
              </div>
            </div>

            <LineItemsEditor
              title="أصناف التحويل"
              columns={COLUMNS}
              rows={rows}
              onChange={setRows}
              nextId={nextId}
              onNextId={setNextId}
            />

            <p className="rounded-lg bg-accent-500/8 px-3 py-2 text-xs text-[color:var(--text-secondary)]">
              عند الحفظ تُخصم الكميات من الفرع المُرسِل وتظهر «جاري التحويل» عند المستلم حتى يعمّد الاستلام.
            </p>

            {state.error && (
              <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-600">
                {state.error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost">
                  إلغاء
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={pending}>
                {pending ? 'جارٍ الإرسال…' : 'إرسال التحويل'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

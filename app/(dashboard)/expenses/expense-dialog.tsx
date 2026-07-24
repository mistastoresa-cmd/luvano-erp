'use client'

import { useActionState, useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Plus, X, Money, Bank, Check as CheckIcon, Clock } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ActionState } from '@/lib/authz/action-session'
import { createExpenseAction, postExpenseAction } from './actions'

type Method = 'cash' | 'bank' | 'cheque' | 'credit'

const METHODS: { value: Method; label: string; icon: React.ReactNode }[] = [
  { value: 'cash', label: 'نقدي / كاش', icon: <Money size={16} weight="bold" /> },
  { value: 'bank', label: 'تحويل بنكي', icon: <Bank size={16} weight="bold" /> },
  { value: 'cheque', label: 'شيك', icon: <CheckIcon size={16} weight="bold" /> },
  { value: 'credit', label: 'آجل (على الحساب)', icon: <Clock size={16} weight="bold" /> },
]

const selectCls =
  'mt-1 h-9 w-full rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface)] px-3 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent-500'

export function ExpenseDialog({
  expenseAccounts,
  banks,
  branches,
}: {
  expenseAccounts: { id: string; label: string }[]
  banks: { id: string; label: string }[]
  branches: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState<Method>('cash')
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createExpenseAction, {
    ok: false,
  })

  useEffect(() => {
    if (state.ok) {
      setOpen(false)
      setMethod('cash')
    }
  }, [state.ok])

  const needsBank = method === 'bank' || method === 'cheque'

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button>
          <Plus size={16} weight="bold" />
          مصروف جديد
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed start-1/2 top-1/2 z-50 max-h-[90dvh] w-[94vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-5 shadow-xl rtl:translate-x-1/2">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold text-[color:var(--text-primary)]">
              تسجيل مصروف
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-[color:var(--text-tertiary)] hover:bg-[color:var(--surface-sunken)]">
              <X size={18} />
            </Dialog.Close>
          </div>

          <form action={formAction} className="space-y-4">
            <input type="hidden" name="paymentMethod" value={method} />

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="expenseAccountId">
                  حساب المصروف<span className="text-danger-600"> *</span>
                </Label>
                <select id="expenseAccountId" name="expenseAccountId" required defaultValue="" className={selectCls}>
                  <option value="" disabled>
                    اختر من شجرة الحسابات…
                  </option>
                  {expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="expenseDate">
                  التاريخ<span className="text-danger-600"> *</span>
                </Label>
                <Input id="expenseDate" name="expenseDate" type="date" required />
              </div>
              <div>
                <Label htmlFor="branchId">الفرع (اختياري)</Label>
                <select id="branchId" name="branchId" defaultValue="" className={selectCls}>
                  <option value="">مصروف مركزي</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="amount">
                  المبلغ (ر.س)<span className="text-danger-600"> *</span>
                </Label>
                <Input id="amount" name="amount" type="number" step="any" required placeholder="1000" />
              </div>
              <div>
                <Label htmlFor="taxAmount">ضريبة المدخلات (ر.س)</Label>
                <Input id="taxAmount" name="taxAmount" type="number" step="any" placeholder="150" />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="beneficiary">الجهة المستفيدة</Label>
                <Input id="beneficiary" name="beneficiary" placeholder="مؤجر المحل" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="description">البيان</Label>
                <Input id="description" name="description" placeholder="إيجار شهر يوليو" />
              </div>
            </div>

            {/* payment method picker */}
            <div>
              <Label>طريقة الدفع</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {METHODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMethod(m.value)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                      method === m.value
                        ? 'border-accent-500 bg-accent-500/10 text-accent-600'
                        : 'border-[color:var(--border-default)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-sunken)]'
                    }`}
                  >
                    {m.icon}
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {needsBank && (
              <div className="grid grid-cols-1 gap-3.5 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)] p-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="bankAccountId">
                    الحساب البنكي<span className="text-danger-600"> *</span>
                  </Label>
                  {banks.length > 0 ? (
                    <select id="bankAccountId" name="bankAccountId" required defaultValue="" className={selectCls}>
                      <option value="" disabled>
                        اختر البنك…
                      </option>
                      {banks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="mt-1 text-xs text-danger-600">
                      لا توجد حسابات بنكية — أضف بنكاً من قسم «البنوك» أولاً.
                    </p>
                  )}
                </div>
                {method === 'cheque' && (
                  <>
                    <div>
                      <Label htmlFor="chequeNumber">رقم الشيك</Label>
                      <Input id="chequeNumber" name="chequeNumber" placeholder="000123" />
                    </div>
                    <div>
                      <Label htmlFor="chequeDueDate">تاريخ الاستحقاق</Label>
                      <Input id="chequeDueDate" name="chequeDueDate" type="date" />
                    </div>
                  </>
                )}
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)]">
              <input
                type="checkbox"
                name="postNow"
                defaultChecked
                className="size-4 rounded border-[color:var(--border-default)] accent-accent-600"
              />
              ترحيل القيد المحاسبي فوراً
            </label>

            {state.error && (
              <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-600">{state.error}</p>
            )}

            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost">
                  إلغاء
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={pending}>
                {pending ? 'جارٍ الحفظ…' : 'حفظ المصروف'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function PostExpenseButton({ expenseId }: { expenseId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(postExpenseAction, {
    ok: false,
  })
  return (
    <form action={action}>
      <input type="hidden" name="expenseId" value={expenseId} />
      <Button type="submit" variant="secondary" disabled={pending} className="h-7 px-2 text-xs">
        {pending ? '...' : 'ترحيل'}
      </Button>
      {state.error && <span className="ms-1 text-[11px] text-danger-600">{state.error}</span>}
    </form>
  )
}

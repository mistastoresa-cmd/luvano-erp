'use client'

import { useActionState, useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Plus, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ActionState } from '@/lib/authz/action-session'

export interface FieldSpec {
  name: string
  label: string
  type?: 'text' | 'number' | 'tel' | 'email' | 'date' | 'select'
  required?: boolean
  placeholder?: string
  options?: { value: string; label: string }[]
  defaultValue?: string
}

// One reusable add-dialog + form wired to a Server Action via useActionState.
// Each module passes its field specs and its action; on success the dialog
// closes and the list revalidates (the action calls revalidatePath).
export function AddResourceDialog({
  title,
  triggerLabel,
  fields,
  action,
}: {
  title: string
  triggerLabel: string
  fields: FieldSpec[]
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(action, { ok: false })

  useEffect(() => {
    if (state.ok) setOpen(false)
  }, [state.ok])

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button>
          <Plus size={16} weight="bold" />
          {triggerLabel}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed start-1/2 top-1/2 z-50 max-h-[85dvh] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-5 shadow-xl rtl:translate-x-1/2">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold text-[color:var(--text-primary)]">
              {title}
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-[color:var(--text-tertiary)] hover:bg-[color:var(--surface-sunken)]">
              <X size={18} />
            </Dialog.Close>
          </div>

          <form action={formAction} className="space-y-3.5">
            {fields.map((f) => (
              <div key={f.name}>
                <Label htmlFor={f.name}>
                  {f.label}
                  {f.required && <span className="text-danger-600"> *</span>}
                </Label>
                {f.type === 'select' ? (
                  <select
                    id={f.name}
                    name={f.name}
                    required={f.required}
                    defaultValue={f.defaultValue ?? ''}
                    className="mt-1 h-9 w-full rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface)] px-3 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent-500"
                  >
                    <option value="" disabled>
                      اختر…
                    </option>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={f.name}
                    name={f.name}
                    type={f.type ?? 'text'}
                    required={f.required}
                    placeholder={f.placeholder}
                    defaultValue={f.defaultValue}
                    step={f.type === 'number' ? 'any' : undefined}
                  />
                )}
              </div>
            ))}

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
                {pending ? 'جارٍ الحفظ…' : 'حفظ'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

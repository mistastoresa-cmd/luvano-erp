'use client'

import { useActionState } from 'react'
import { ArrowsClockwise } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { AddResourceDialog } from '@/components/forms/resource-form'
import type { ActionState } from '@/lib/authz/action-session'
import { ensureDefaultAccountsAction, createAccountAction } from './chart-actions'

export function ChartToolbar() {
  const [state, ensure, pending] = useActionState<ActionState, FormData>(
    ensureDefaultAccountsAction,
    { ok: false }
  )

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {state.error && (
        <span className="text-xs text-[color:var(--text-tertiary)]">{state.error}</span>
      )}
      <form action={ensure}>
        <Button type="submit" variant="secondary" disabled={pending}>
          <ArrowsClockwise size={15} weight="bold" />
          {pending ? 'جارٍ الاستكمال…' : 'استكمال الحسابات الافتراضية'}
        </Button>
      </form>
      <AddResourceDialog
        title="إضافة حساب للشجرة"
        triggerLabel="إضافة حساب"
        action={createAccountAction}
        fields={[
          { name: 'code', label: 'رمز الحساب', required: true, placeholder: '5350' },
          { name: 'name', label: 'اسم الحساب', required: true, placeholder: 'قرطاسية' },
          {
            name: 'type',
            label: 'نوع الحساب',
            type: 'select',
            required: true,
            options: [
              { value: 'expense', label: 'مصروفات' },
              { value: 'revenue', label: 'إيرادات' },
              { value: 'asset', label: 'أصول' },
              { value: 'liability', label: 'خصوم' },
              { value: 'equity', label: 'حقوق ملكية' },
            ],
          },
        ]}
      />
    </div>
  )
}

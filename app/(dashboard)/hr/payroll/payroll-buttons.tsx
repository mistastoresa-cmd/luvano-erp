'use client'

import { useActionState } from 'react'
import { Calculator, ArrowsClockwise } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import type { ActionState } from '@/lib/authz/action-session'
import { processPayrollAction, postPayrollAction } from './actions'

export function ProcessButton({ payrollRunId }: { payrollRunId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(processPayrollAction, {
    ok: false,
  })
  return (
    <div className="flex flex-col items-end gap-1">
      <form action={action}>
        <input type="hidden" name="payrollRunId" value={payrollRunId} />
        <Button type="submit" disabled={pending} className="h-7 px-2 text-xs">
          <Calculator size={13} weight="bold" />
          {pending ? '...' : 'احتساب'}
        </Button>
      </form>
      {state.error && <span className="text-[11px] text-danger-600">{state.error}</span>}
    </div>
  )
}

export function PostButton({ payrollRunId }: { payrollRunId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(postPayrollAction, {
    ok: false,
  })
  return (
    <div className="flex flex-col items-end gap-1">
      <form action={action}>
        <input type="hidden" name="payrollRunId" value={payrollRunId} />
        <Button type="submit" variant="secondary" disabled={pending} className="h-7 px-2 text-xs">
          <ArrowsClockwise size={13} weight="bold" />
          {pending ? '...' : 'ترحيل محاسبي'}
        </Button>
      </form>
      {state.error && <span className="text-[11px] text-danger-600">{state.error}</span>}
    </div>
  )
}

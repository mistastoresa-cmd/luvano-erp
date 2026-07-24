'use client'

import { useActionState } from 'react'
import { Check, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import type { ActionState } from '@/lib/authz/action-session'
import { approveLeaveAction, rejectLeaveAction } from './actions'

export function LeaveDecisionButtons({ leaveRequestId }: { leaveRequestId: string }) {
  const [aState, approve, approving] = useActionState<ActionState, FormData>(approveLeaveAction, {
    ok: false,
  })
  const [rState, reject, rejecting] = useActionState<ActionState, FormData>(rejectLeaveAction, {
    ok: false,
  })
  const error = aState.error || rState.error

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <form action={approve}>
          <input type="hidden" name="leaveRequestId" value={leaveRequestId} />
          <Button type="submit" disabled={approving} className="h-7 px-2 text-xs">
            <Check size={13} weight="bold" />
            اعتماد
          </Button>
        </form>
        <form action={reject}>
          <input type="hidden" name="leaveRequestId" value={leaveRequestId} />
          <Button
            type="submit"
            variant="ghost"
            disabled={rejecting}
            className="h-7 px-2 text-xs text-danger-600"
          >
            <X size={13} weight="bold" />
            رفض
          </Button>
        </form>
      </div>
      {error && <span className="text-[11px] text-danger-600">{error}</span>}
    </div>
  )
}

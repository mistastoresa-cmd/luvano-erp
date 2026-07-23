'use client'

import { useActionState } from 'react'
import { CheckCircle, XCircle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import type { ActionState } from '@/lib/authz/action-session'
import { approveTransferAction, cancelTransferAction } from './actions'

export function TransferActionButtons({ transferId }: { transferId: string }) {
  const [approveState, approve, approving] = useActionState<ActionState, FormData>(
    approveTransferAction,
    { ok: false }
  )
  const [cancelState, cancel, cancelling] = useActionState<ActionState, FormData>(
    cancelTransferAction,
    { ok: false }
  )
  const error = approveState.error || cancelState.error

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <form action={approve}>
          <input type="hidden" name="transferId" value={transferId} />
          <Button type="submit" disabled={approving} className="h-8 px-2.5 text-xs">
            <CheckCircle size={14} weight="bold" />
            {approving ? '...' : 'تعميد الاستلام'}
          </Button>
        </form>
        <form action={cancel}>
          <input type="hidden" name="transferId" value={transferId} />
          <Button type="submit" variant="ghost" disabled={cancelling} className="h-8 px-2.5 text-xs text-danger-600">
            <XCircle size={14} weight="bold" />
            إلغاء
          </Button>
        </form>
      </div>
      {error && <span className="text-[11px] text-danger-600">{error}</span>}
    </div>
  )
}

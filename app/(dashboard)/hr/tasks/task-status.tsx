'use client'

import { useActionState } from 'react'
import type { ActionState } from '@/lib/authz/action-session'
import { updateTaskStatusAction } from './actions'

const OPTIONS = [
  { value: 'pending', label: 'قيد الانتظار' },
  { value: 'in_progress', label: 'جارية' },
  { value: 'done', label: 'منجزة' },
  { value: 'cancelled', label: 'ملغاة' },
]

// A status <select> that submits on change — the whole control is the action,
// so there's no extra save button per row.
export function TaskStatusSelect({ taskId, status }: { taskId: string; status: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateTaskStatusAction, {
    ok: false,
  })

  return (
    <form action={action}>
      <input type="hidden" name="taskId" value={taskId} />
      <select
        name="status"
        defaultValue={status}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-8 rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface)] px-2 text-xs text-[color:var(--text-primary)] outline-none focus:border-accent-500 disabled:opacity-60"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {state.error && <span className="ms-1 text-[11px] text-danger-600">{state.error}</span>}
    </form>
  )
}

'use client'

import { useActionState, useState } from 'react'
import { ArrowRight, Scales } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { LineItemsEditor, emptyRow, type LineColumn, type LineRow } from '@/components/forms/line-items'
import type { ActionState } from '@/lib/authz/action-session'
import { createJournalEntryAction } from '../../actions'

export function JournalEntryForm({
  accounts,
}: {
  accounts: { key: string; label: string }[]
}) {
  const columns: LineColumn[] = [
    {
      key: 'accountKey',
      label: 'الحساب',
      type: 'select',
      options: accounts.map((a) => ({ value: a.key, label: a.label })),
      span: 'sm:col-span-2',
    },
    { key: 'debit', label: 'مدين (ر.س)', type: 'number', placeholder: '0.00' },
    { key: 'credit', label: 'دائن (ر.س)', type: 'number', placeholder: '0.00' },
    { key: 'description', label: 'البيان', span: 'sm:col-span-2' },
  ]

  const [rows, setRows] = useState<LineRow[]>([emptyRow(1, columns), emptyRow(2, columns)])
  const [nextId, setNextId] = useState(3)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createJournalEntryAction,
    { ok: false }
  )

  const totalDebit = rows.reduce((s, r) => s + (Number(r.debit) || 0), 0)
  const totalCredit = rows.reduce((s, r) => s + (Number(r.credit) || 0), 0)
  const balanced = Math.round((totalDebit - totalCredit) * 100) === 0 && totalDebit > 0

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
            <Label htmlFor="entryDate">
              تاريخ القيد<span className="text-danger-600"> *</span>
            </Label>
            <Input id="entryDate" name="entryDate" type="date" required />
          </div>
          <div>
            <Label htmlFor="description">البيان</Label>
            <Input id="description" name="description" placeholder="وصف القيد" />
          </div>
        </CardContent>
      </Card>

      <LineItemsEditor
        title="بنود القيد"
        columns={columns}
        rows={rows}
        onChange={setRows}
        nextId={nextId}
        onNextId={setNextId}
        footer={
          <div
            className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3.5 py-2.5 ${
              balanced ? 'bg-success-500/10' : 'bg-warning-500/12'
            }`}
          >
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Scales size={16} weight="bold" className={balanced ? 'text-success-600' : 'text-warning-600'} />
              <span className={balanced ? 'text-success-600' : 'text-warning-600'}>
                {balanced ? 'القيد متوازن' : 'القيد غير متوازن'}
              </span>
            </span>
            <span className="tabular-figures text-sm text-[color:var(--text-secondary)]">
              مدين {fmt(totalDebit)} · دائن {fmt(totalCredit)}
            </span>
          </div>
        }
      />

      {state.error && (
        <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-600">{state.error}</p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !balanced}>
          {pending ? 'جارٍ الترحيل…' : 'ترحيل القيد'}
          <ArrowRight size={16} weight="bold" />
        </Button>
      </div>
    </form>
  )
}

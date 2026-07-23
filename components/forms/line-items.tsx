'use client'

import { Plus, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface LineColumn {
  key: string
  label: string
  type?: 'text' | 'number' | 'select'
  placeholder?: string
  // `patch` lets one selection fill several fields at once — picking a
  // product fills its name and price into the same row, so the user never
  // retypes a SKU by hand.
  options?: { value: string; label: string; patch?: Record<string, string> }[]
  // Tailwind col-span within the row grid.
  span?: string
}

export type LineRow = { id: number } & Record<string, string>

export function emptyRow(id: number, columns: LineColumn[]): LineRow {
  const r = { id } as LineRow
  for (const c of columns) r[c.key] = ''
  return r
}

// Shared dynamic line-item editor for documents that carry lines (purchase
// orders, journal entries, sale invoices). Rows live in the parent's state;
// the parent serializes them into a hidden field on submit.
export function LineItemsEditor({
  title,
  columns,
  rows,
  onChange,
  nextId,
  onNextId,
  footer,
}: {
  title: string
  columns: LineColumn[]
  rows: LineRow[]
  onChange: (rows: LineRow[]) => void
  nextId: number
  onNextId: (n: number) => void
  footer?: React.ReactNode
}) {
  function update(id: number, key: string, value: string) {
    onChange(rows.map((r) => (r.id === id ? { ...r, [key]: value } : r)))
  }
  // Picking an option can carry a `patch` that fills sibling fields in the
  // same row (e.g. selecting a product fills its name + sell price).
  function select(id: number, column: LineColumn, value: string) {
    const patch = column.options?.find((o) => o.value === value)?.patch ?? {}
    onChange(rows.map((r) => (r.id === id ? { ...r, [column.key]: value, ...patch } : r)))
  }
  function add() {
    onChange([...rows, emptyRow(nextId, columns)])
    onNextId(nextId + 1)
  }
  function remove(id: number) {
    if (rows.length > 1) onChange(rows.filter((r) => r.id !== id))
  }

  return (
    <div className="rounded-xl border border-[color:var(--border-subtle)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-[color:var(--text-secondary)]">{title}</span>
        <Button type="button" variant="secondary" onClick={add} className="h-8 px-2.5 text-xs">
          <Plus size={14} weight="bold" />
          إضافة سطر
        </Button>
      </div>

      <div className="space-y-2.5">
        {rows.map((row, idx) => (
          <div
            key={row.id}
            className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)] p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-[color:var(--text-tertiary)]">
                سطر #{idx + 1}
              </span>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(row.id)}
                  className="rounded p-1 text-danger-600 hover:bg-danger-500/10"
                  aria-label="حذف السطر"
                >
                  <Trash size={15} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {columns.map((c) => (
                <div key={c.key} className={c.span}>
                  <Label>{c.label}</Label>
                  {c.type === 'select' ? (
                    <select
                      value={row[c.key] ?? ''}
                      onChange={(e) => select(row.id, c, e.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface)] px-3 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent-500"
                    >
                      <option value="">اختر…</option>
                      {c.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      type={c.type === 'number' ? 'number' : 'text'}
                      step={c.type === 'number' ? 'any' : undefined}
                      value={row[c.key] ?? ''}
                      onChange={(e) => update(row.id, c.key, e.target.value)}
                      placeholder={c.placeholder}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {footer && <div className="mt-3">{footer}</div>}
    </div>
  )
}

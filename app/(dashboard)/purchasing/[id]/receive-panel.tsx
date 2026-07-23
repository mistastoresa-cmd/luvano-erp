'use client'

import { useActionState, useState } from 'react'
import { PaperPlaneTilt, Package } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import type { ActionState } from '@/lib/authz/action-session'
import { sendPurchaseOrderAction, receivePurchaseOrderAction } from './actions'

export interface POLine {
  sku: string
  productName: string
  quantityOrdered: number
  quantityReceivedSoFar: number
  unitCost: number
}

export function SendButton({ purchaseOrderId }: { purchaseOrderId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(sendPurchaseOrderAction, {
    ok: false,
  })
  return (
    <form action={action}>
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      <Button type="submit" disabled={pending}>
        <PaperPlaneTilt size={16} weight="bold" />
        {pending ? 'جارٍ الإرسال…' : 'إرسال للمورد'}
      </Button>
      {state.error && <span className="ms-2 text-xs text-danger-600">{state.error}</span>}
    </form>
  )
}

export function ReceivePanel({
  purchaseOrderId,
  lines,
}: {
  purchaseOrderId: string
  lines: POLine[]
}) {
  // Prefill each line with the still-outstanding quantity.
  const [received, setReceived] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      lines.map((l) => [l.sku, String(Math.max(0, l.quantityOrdered - l.quantityReceivedSoFar))])
    )
  )
  const [costs, setCosts] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.sku, String(l.unitCost)]))
  )
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    receivePurchaseOrderAction,
    { ok: false }
  )

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[color:var(--text-secondary)]">
          <Package size={16} weight="bold" className="text-accent-600" />
          تسجيل استلام
        </div>
        <form
          action={(fd) => {
            const payload = lines.map((l) => ({
              sku: l.sku,
              quantityReceived: received[l.sku] ?? '0',
              unitCost: costs[l.sku] ?? '0',
            }))
            fd.set('purchaseOrderId', purchaseOrderId)
            fd.set('linesJson', JSON.stringify(payload))
            return formAction(fd)
          }}
          className="space-y-3"
        >
          {lines.map((l) => {
            const outstanding = l.quantityOrdered - l.quantityReceivedSoFar
            return (
              <div
                key={l.sku}
                className="grid grid-cols-1 gap-2.5 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)] p-3 sm:grid-cols-[1fr_auto_auto]"
              >
                <div>
                  <div className="text-sm font-medium">{l.productName}</div>
                  <div className="font-mono text-[11px] text-[color:var(--text-tertiary)]">
                    {l.sku} · مطلوب {l.quantityOrdered} · مستلم سابقاً {l.quantityReceivedSoFar} · متبقٍ{' '}
                    {outstanding}
                  </div>
                </div>
                <div className="w-24">
                  <Label>الكمية</Label>
                  <Input
                    type="number"
                    step="any"
                    value={received[l.sku] ?? ''}
                    onChange={(e) => setReceived((s) => ({ ...s, [l.sku]: e.target.value }))}
                  />
                </div>
                <div className="w-28">
                  <Label>التكلفة</Label>
                  <Input
                    type="number"
                    step="any"
                    value={costs[l.sku] ?? ''}
                    onChange={(e) => setCosts((s) => ({ ...s, [l.sku]: e.target.value }))}
                  />
                </div>
              </div>
            )
          })}

          {state.error && (
            <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-600">{state.error}</p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? 'جارٍ الحفظ…' : 'تسجيل الاستلام'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

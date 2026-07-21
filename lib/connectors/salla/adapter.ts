import { createHmac, timingSafeEqual } from 'node:crypto'
import type { InventorySourceConnector, NormalizedInventoryEvent } from '../types'
import { isSallaOrderWebhookPayload, type SallaOrderWebhookPayload } from './types'

// Pure normalization over fixture-shaped Salla payloads — no live HTTP calls, no
// route wiring. Exercised only by unit tests in this phase (see
// tests/connectors/salla-adapter.test.ts). Mirrors the fetch/pagination *pattern*
// established in luvano-dashboard/lib/salla-client.ts (sallaFetch/sallaFetchAll)
// for any future order-detail lookups this connector will need once wired to a
// live webhook route.
//
// Corrected during /plan-eng-review of the live-webhook plan: this originally
// assumed Salla sends distinct "order.refunded"/"order.cancelled" events. It
// doesn't — luvano-dashboard's production webhook route (real Salla traffic,
// see app/api/webhooks/salla/route.ts) shows refunds/cancellations arrive as
// order.status.updated with a status.slug string ("cancel"/"refund" substring
// match), matched the same way there.

function isRefundStatus(status: SallaOrderWebhookPayload['data']['status']): boolean {
  if (!status) return false
  const slug = (typeof status === 'string' ? status : (status.slug ?? status.name ?? '')).toLowerCase()
  return slug.includes('cancel') || slug.includes('refund')
}

export class SallaConnector implements InventorySourceConnector {
  readonly platform = 'salla' as const

  verifyWebhookSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    const providedBuf = Buffer.from(signatureHeader, 'hex')
    if (expectedBuf.length !== providedBuf.length) return false
    return timingSafeEqual(expectedBuf, providedBuf)
  }

  normalizeWebhookEvent(rawPayload: unknown): NormalizedInventoryEvent[] {
    if (!isSallaOrderWebhookPayload(rawPayload)) return []
    const payload: SallaOrderWebhookPayload = rawPayload
    const occurredAt = new Date(payload.data.created_at)

    if (payload.event === 'order.created') {
      return payload.data.items.map((item) => ({
        externalOrderId: String(payload.data.id),
        sku: item.sku,
        quantityDelta: -Math.abs(item.quantity),
        occurredAt,
        reason: 'sale',
      }))
    }

    if (payload.event === 'order.status.updated') {
      if (!isRefundStatus(payload.data.status)) return [] // status change with no inventory impact (e.g. "shipped")

      // luvano-dashboard's production route never reads `items` on this event
      // (see its order.status.updated handler) — real Salla payloads on this
      // event likely omit line items entirely. If they're present, use them;
      // if not, this returns [] rather than silently generating nothing wrong
      // but also nothing right. Restoring stock on a real refund with no items
      // here requires a follow-up order-detail API fetch — not yet built, see
      // docs/ARCHITECTURE.md.
      if (payload.data.items.length === 0) return []

      return payload.data.items.map((item) => ({
        externalOrderId: String(payload.data.id),
        sku: item.sku,
        quantityDelta: Math.abs(item.quantity),
        occurredAt,
        reason: 'return',
      }))
    }

    return []
  }
}

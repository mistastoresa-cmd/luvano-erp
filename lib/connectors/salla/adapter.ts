import { createHmac, timingSafeEqual } from 'node:crypto'
import type { InventorySourceConnector, NormalizedInventoryEvent } from '../types'
import { isSallaOrderWebhookPayload, type SallaOrderWebhookPayload } from './types'

// Pure normalization over fixture-shaped Salla payloads — no live HTTP calls, no
// route wiring. Exercised only by unit tests in this phase (see
// tests/connectors/salla-adapter.test.ts). Mirrors the fetch/pagination *pattern*
// established in luvano-dashboard/lib/salla-client.ts (sallaFetch/sallaFetchAll)
// for any future order-detail lookups this connector will need once wired to a
// live webhook route.

const REFUND_EVENTS = new Set(['order.refunded', 'order.cancelled'])

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
    const isRefund = REFUND_EVENTS.has(payload.event)
    const occurredAt = new Date(payload.data.created_at)

    return payload.data.items.map((item) => ({
      externalOrderId: String(payload.data.id),
      sku: item.sku,
      // Sale decrements stock (negative), refund/cancel restores it (positive).
      quantityDelta: isRefund ? Math.abs(item.quantity) : -Math.abs(item.quantity),
      occurredAt,
      reason: isRefund ? 'return' : 'sale',
    }))
  }
}

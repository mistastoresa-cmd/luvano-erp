// Platform-agnostic boundary. A Zid or Shopify adapter can implement this later
// without touching the ledger core — but no such adapter is built in this phase;
// there is zero demand evidence for anything beyond Salla (see the design doc's
// "Demand Evidence" section).

export type MovementReason = 'sale' | 'return'

export interface NormalizedInventoryEvent {
  externalOrderId: string
  sku: string
  quantityDelta: number
  occurredAt: Date
  reason: MovementReason
}

export interface InventorySourceConnector {
  readonly platform: 'salla' | 'zid' | 'shopify'
  verifyWebhookSignature(rawBody: string, signatureHeader: string, secret: string): boolean
  normalizeWebhookEvent(rawPayload: unknown): NormalizedInventoryEvent[]
}

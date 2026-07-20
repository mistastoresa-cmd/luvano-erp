// Minimal shape of the Salla order-webhook payload fields this adapter actually
// reads. Not a full Salla API type — just what's needed to normalize an order
// event into inventory movements.

export interface SallaOrderWebhookItem {
  sku: string
  product_id: number | string
  quantity: number
}

export interface SallaOrderWebhookPayload {
  event: string // e.g. "order.created", "order.status.updated"
  data: {
    id: number | string
    created_at: string
    items: SallaOrderWebhookItem[]
  }
}

export function isSallaOrderWebhookPayload(payload: unknown): payload is SallaOrderWebhookPayload {
  if (typeof payload !== 'object' || payload === null) return false
  const p = payload as Record<string, unknown>
  if (typeof p.event !== 'string') return false
  if (typeof p.data !== 'object' || p.data === null) return false
  const data = p.data as Record<string, unknown>
  return Array.isArray(data.items)
}

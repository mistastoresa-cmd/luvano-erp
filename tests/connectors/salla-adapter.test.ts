import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { SallaConnector } from '@/lib/connectors/salla/adapter'

describe('SallaConnector', () => {
  const connector = new SallaConnector()

  it('normalizes an order.created payload into negative-delta sale events', () => {
    const payload = {
      event: 'order.created',
      data: {
        id: 123456,
        created_at: '2026-07-19T10:00:00Z',
        items: [
          { sku: 'SKU-1', product_id: 1, quantity: 2 },
          { sku: 'SKU-2', product_id: 2, quantity: 1 },
        ],
      },
    }

    const events = connector.normalizeWebhookEvent(payload)
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      externalOrderId: '123456',
      sku: 'SKU-1',
      quantityDelta: -2,
      reason: 'sale',
    })
    expect(events[1].quantityDelta).toBe(-1)
  })

  it('normalizes order.status.updated with a cancel/refund slug into positive-delta return events', () => {
    const payload = {
      event: 'order.status.updated',
      data: {
        id: 999,
        created_at: '2026-07-19T12:00:00Z',
        status: { slug: 'canceled' },
        items: [{ sku: 'SKU-1', product_id: 1, quantity: 2 }],
      },
    }

    const [event] = connector.normalizeWebhookEvent(payload)
    expect(event.quantityDelta).toBe(2)
    expect(event.reason).toBe('return')
  })

  it('ignores order.status.updated for a non-refund status change (e.g. shipped)', () => {
    const payload = {
      event: 'order.status.updated',
      data: {
        id: 999,
        created_at: '2026-07-19T12:00:00Z',
        status: { slug: 'shipped' },
        items: [{ sku: 'SKU-1', product_id: 1, quantity: 2 }],
      },
    }

    expect(connector.normalizeWebhookEvent(payload)).toEqual([])
  })

  it('returns an empty array for a cancel/refund status update with no items in the payload', () => {
    const payload = {
      event: 'order.status.updated',
      data: {
        id: 999,
        created_at: '2026-07-19T12:00:00Z',
        status: { slug: 'refunded' },
        items: [],
      },
    }

    expect(connector.normalizeWebhookEvent(payload)).toEqual([])
  })

  it('returns an empty array for a payload that does not match the expected shape', () => {
    expect(connector.normalizeWebhookEvent({ unrelated: true })).toEqual([])
  })

  it('verifies a correctly signed webhook body', () => {
    const secret = 'test-secret'
    const rawBody = JSON.stringify({ event: 'order.created' })
    const signature = createHmac('sha256', secret).update(rawBody).digest('hex')

    expect(connector.verifyWebhookSignature(rawBody, signature, secret)).toBe(true)
  })

  it('rejects a tampered webhook body', () => {
    const secret = 'test-secret'
    const rawBody = JSON.stringify({ event: 'order.created' })
    const signature = createHmac('sha256', secret).update(rawBody).digest('hex')

    expect(connector.verifyWebhookSignature('{"tampered":true}', signature, secret)).toBe(false)
  })
})

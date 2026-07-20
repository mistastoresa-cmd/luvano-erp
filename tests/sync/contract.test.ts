import { describe, it, expect } from 'vitest'
import { MAX_SYNC_BATCH_ITEMS, type SyncBatchRequest, type SyncBatchResponse } from '@/lib/sync/types'

// No route handler exists yet in this phase — this is a type-level/shape
// assertion that the contract is well-formed and usable, not an integration test.
describe('sync batch contract', () => {
  it('accepts a well-formed request shape', () => {
    const request: SyncBatchRequest = {
      branchId: 'branch-1',
      deviceId: 'device-1',
      items: [
        {
          clientGeneratedId: 'client-uuid-1',
          type: 'inventory_movement',
          occurredAt: new Date().toISOString(),
          payload: {
            tenantId: 'tenant-1',
            branchId: 'branch-1',
            sku: 'SKU-1',
            quantityDelta: -1,
            reason: 'sale',
            sourceType: 'branch_offline_sync',
            idempotencyKey: 'client-uuid-1',
            occurredAt: new Date(),
          },
        },
      ],
    }

    expect(request.items).toHaveLength(1)
  })

  it('produces a well-formed response shape', () => {
    const response: SyncBatchResponse = {
      batchId: 'batch-1',
      results: [{ clientGeneratedId: 'client-uuid-1', status: 'accepted', serverId: 'movement-1' }],
    }

    expect(response.results[0].status).toBe('accepted')
  })

  it('exposes a batch size bound for client-side chunking', () => {
    expect(MAX_SYNC_BATCH_ITEMS).toBe(500)
  })
})

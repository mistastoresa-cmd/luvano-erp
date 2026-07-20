// The branch-sync API's contract — server side only in this phase. No PWA client
// and no app/api/sync/route.ts handler exist yet (the path is reserved and
// documented in docs/ARCHITECTURE.md for the next phase); this file defines the
// shape that endpoint will accept/return so the ledger's write path
// (recordInventoryMovement / recordSaleInvoice) already matches what the future
// client will send.
import type { RecordInventoryMovementInput, RecordSaleInvoiceInput } from '../ledger/types'

export interface SyncBatchItem {
  // UUID generated offline by the PWA, before the item ever reaches a server.
  // Doubles as the ledger's idempotencyKey for this item.
  clientGeneratedId: string
  type: 'invoice' | 'inventory_movement'
  // ISO timestamp, client clock — used to replay the branch's backlog in the
  // order it actually happened. See docs/design-spikes/02-offline-reconciliation.md.
  occurredAt: string
  payload: RecordSaleInvoiceInput | RecordInventoryMovementInput
}

export interface SyncBatchRequest {
  branchId: string
  deviceId: string
  items: SyncBatchItem[]
}

export interface SyncBatchItemResult {
  clientGeneratedId: string
  status: 'accepted' | 'duplicate' | 'rejected'
  serverId?: string
  reason?: string
}

export interface SyncBatchResponse {
  batchId: string
  results: SyncBatchItemResult[]
}

// Worst-case transaction size bound — oversized backlogs are chunked client-side
// into multiple batch calls instead of one unbounded request.
export const MAX_SYNC_BATCH_ITEMS = 500

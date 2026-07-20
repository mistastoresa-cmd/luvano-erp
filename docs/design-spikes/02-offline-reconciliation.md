# Design Spike 2: Offline-Queue Reconciliation After a Branch Reconnects

## The problem

A branch must keep issuing invoices and recording inventory movements during an
internet outage (see the design doc's offline-first requirement). When
connectivity returns, potentially hours of locally-queued operations need to
reconcile against a ledger that may have kept moving in the meantime (e.g. the
same SKU sold online via Salla while the branch was offline).

## Recommendation: idempotency-key + occurred_at ordered replay via the sync-batch endpoint

Each offline-created invoice/movement carries a client-generated UUID
(`clientGeneratedId`), assigned the moment it's created in the browser — before
any server contact. This UUID doubles as the ledger's `idempotencyKey` for that
row (see `lib/sync/types.ts::SyncBatchItem`).

When connectivity returns, the PWA POSTs its entire local queue as one
`SyncBatchRequest`. The server processes items **in `occurredAt` order** (not
batch-arrival order), so a branch's own multi-hour backlog replays in the
sequence it actually happened — this matters because the balance-update math in
Spike 1 is a relative delta, and applying a branch's sales out of order against
concurrent online sales could produce a different (though not incorrect) final
balance than applying them in true chronological order.

Each item is inserted through the same `(tenant_id, idempotency_key)` unique
constraint used everywhere else in the ledger (see
`lib/ledger/service.ts::isUniqueViolation`). If the same item is submitted twice
— e.g. the browser retried a sync call after a timeout that had actually
succeeded server-side — the second insert is a no-op detected by the unique
constraint and reported back as `status: 'duplicate'`, not an error.

## Oversell during backlog replay

If replaying the backlog drives a SKU deeply negative (Salla sold the same units
online while the branch was offline), that's the identical `oversell` alert path
from Spike 1 — reconciliation is a human review step, not a sync-time block.
Refusing to accept the branch's already-completed sales would mean losing real
transaction data that already happened in the physical world; the ledger's job is
to record reality accurately, not to protect a balance from going negative.

## Batch size bound

A batch is capped at `MAX_SYNC_BATCH_ITEMS = 500` (see `lib/sync/types.ts`) to
bound worst-case transaction size. Oversized backlogs are chunked client-side
into multiple sequential batch calls rather than one unbounded request — this
keeps each server-side transaction's lock duration predictable regardless of how
long a branch was offline.

## What this does not solve (explicitly out of scope for this phase)

- No actual PWA client, service worker, or local IndexedDB queue is built in this
  phase — this spike defines the server-side contract (`app/api/sync` route,
  reserved but not implemented) that a future client will submit against.
- Clock skew between a branch device and the server is not addressed —
  `occurredAt` is trusted as reported by the client. A future phase may need to
  bound how far in the past/future an `occurredAt` value can plausibly be before
  flagging it for review, rather than trusting it unconditionally.

# Design Spike 1: Conflict Resolution for Concurrent Inventory Writers

## The problem

The wedge's premise is a single source of truth for inventory quantity and value.
But two independent writers can decrement the same SKU concurrently: a Salla
webhook (online sale) and a branch POS sale, both hitting the same
`(tenant_id, branch_id, sku)` at the same instant. Without a design for this, the
core technical problem the ledger exists to solve is undesigned.

## Recommendation: append-only ledger + atomic relative SQL updates, no locking, oversell allowed with an alert

**`inventory_movements` rows are never mutated.** Every write is a new fact, so
there is never a "last write wins and silently overwrites a fact" problem — only
an atomic relative update to `inventory_balances` alongside each movement insert.

The current quantity lives in `inventory_balances`, updated via a single atomic
statement:

```sql
INSERT INTO inventory_balances (tenant_id, branch_id, sku, quantity)
VALUES ($1, $2, $3, $4)
ON CONFLICT (tenant_id, branch_id, sku)
DO UPDATE SET quantity = inventory_balances.quantity + $4, version = inventory_balances.version + 1
```

(implemented in `lib/ledger/balance.ts::applyInventoryDelta`), executed inside the
same DB transaction as the `inventory_movements` insert.

Because Postgres evaluates `quantity + $delta` server-side against the *current*
row value, two concurrent writers never lose an update — Postgres's row-level
locking on the `UPDATE` serializes them automatically. No optimistic-lock retry
loop is needed; `version` is exposed for future client-side "did this change
since I last read it" checks, not as the conflict-avoidance mechanism itself.

## The genuinely unresolved business question — deliberately not solved by blocking

"Who wins when a POS sale and a Salla sale both drop the same SKU below zero" is
not answered by refusing either write. The ledger records both movements as
facts, the balance goes negative, and a `reconciliation_alerts` row
(`type: 'oversell'`) is raised for a human to resolve (compensating adjustment,
cancel one order, contact the customer, etc.).

**Justification:** blocking a branch POS sale at checkout because of a webhook
race is worse for the business than a rare oversold unit caught and resolved the
same day. A blocked checkout is a lost sale and an angry customer in front of the
cashier; an oversold unit is a solvable back-office problem.

## What this does not solve (explicitly out of scope for this phase)

- Automatic compensating actions (e.g. auto-cancelling the Salla order) — the
  alert is surfaced for a human, not auto-resolved.
- Cross-branch stock reservation/holds at checkout time — no "reserve this SKU
  while checkout is in progress" mechanism exists; this would reduce oversell
  frequency but adds real complexity and isn't justified before the wedge itself
  is validated with a paying customer.

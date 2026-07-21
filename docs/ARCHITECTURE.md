# Luvano-ERP — Ledger Service Architecture

Approved design doc:
`~/.gstack/projects/Luvano-ERP/abdullahbaaqil-unknown-design-20260719-164841.md`

This is Phase 1 of the "Ledger-first / Strangler Fig" approach (Approach C in the
design doc). It is a **new, standalone** service — `luvano-dashboard` (the
existing production analytics app) is not modified. The dashboard will eventually
become a read-client of this ledger, feature by feature, but that migration is
out of scope for this phase.

## Scope note (deviation from the design doc's original phasing)

The design doc's Approach C originally bounded the ledger to inventory
movements + invoicing only, deferring double-entry accounting/COA explicitly.
The founder later directed building the **schema** (not services/APIs) for all
8 module sections before doing any live Salla integration — accounting first.
This is a real scope expansion beyond the original wedge-only plan; it's schema
only (no business logic, no route handlers, no UI) so the cost of being wrong is
low, but it should be read as a founder-directed amendment to Approach C, not a
silent drift. See git log for the sequence of decisions.

## What exists in this phase

- Multi-tenant Postgres schema (Neon), tenant-isolated via a `tenant_id` column on
  every table, filtered at the application/query layer (not Postgres RLS).
- Two bounded ledger entities: `inventory_movements` (append-only) and
  `sale_invoices` + `sale_invoice_lines` ("unified invoicing" — one invoice per
  sale event regardless of source). These have a working service layer
  (`lib/ledger/service.ts`) — the only module with real read/write logic so far.
- Accounting module schema: `chart_of_accounts` (self-referencing hierarchy),
  `journal_entries` + `journal_entry_lines` (double-entry — the debit-total ===
  credit-total invariant is an application-layer responsibility, not a DB
  constraint, matching the transactional-atomicity pattern already used in
  `lib/ledger/service.ts`), and `fixed_assets`. Schema only — no posting logic,
  no service layer, no route handlers yet.
- Customers: `customers` (CRM entity), with `sale_invoices.customerId` now
  linking to it — `customerName`/`customerPhone` on `sale_invoices` remain as
  free-text fallback for walk-in sales with no registered customer.
- Suppliers + full purchasing cycle (schema only): `suppliers`,
  `purchase_orders` + `purchase_order_lines`, `goods_receipts` +
  `goods_receipt_lines` (with `inventoryMovementId` reserved for closing the
  loop to the ledger once receipt-posting logic exists), `supplier_invoices` +
  `supplier_invoice_lines`, `supplier_payments`. Mirrors the
  PO → receipt → supplier invoice → payment cycle from the design doc's
  vision list.
- **Central-warehouse inventory model** (founder-directed, standard ERP
  practice): `branches.type` now includes `'warehouse'` alongside
  `'physical'`/`'online'`, and `branches.isDefaultWarehouse` (partial unique
  index — at most one default warehouse per tenant) marks the default
  receiving location. Purchases land at the warehouse by default; `stock_transfers`
  + `stock_transfer_lines` move stock from the warehouse to a branch or the
  online store, generating a paired `transfer_out`/`transfer_in`
  `inventory_movements` row each (posting logic not built yet — schema only).
  Direct-to-branch receiving remains possible as an exception path (`goods_receipts.purchaseOrderId`
  is nullable) for cases like an urgent local purchase — the warehouse model
  is the default, not a hard requirement.
- Marketing & Offers: `coupons` (with an optional `sallaCouponCode` link, since
  many merchants manage the coupon itself inside Salla) and
  `marketing_campaigns`.
- HR: `employees`, `attendance_records`, `leave_requests`, `payroll_runs` +
  `payroll_entries`.
- Reports has no dedicated schema — per the design doc it's a horizontal layer
  over the other modules, not a separate module.
- A platform-agnostic connector interface (`lib/connectors/types.ts`) plus a
  concrete Salla implementation (`lib/connectors/salla/adapter.ts`) that
  normalizes webhook payloads into ledger events — pure functions over fixture
  payloads, not wired to a live route.
- A `LedgerService` (`lib/ledger/service.ts`) that writes movements/invoices
  atomically and resolves concurrent-write conflicts per
  `docs/design-spikes/01-conflict-resolution.md`.
- The server-side contract for a future branch-sync API
  (`lib/sync/types.ts`), reconciled per
  `docs/design-spikes/02-offline-reconciliation.md`.

## Document-cycle linking (inventory side only, so far)

Founder-directed: link the modules together through their actual document flow,
starting with the inventory side (deferred: automatic accounting postings — see
below). Two new services now exist alongside `lib/ledger/service.ts`, sharing its
`applyInventoryDelta` primitive and oversell-alert policy
(extracted to `lib/ledger/alerts.ts` for reuse):

- `lib/purchasing/service.ts::postGoodsReceipt` — posts a `goods_receipts`
  row's lines as `inventory_movements` (reason `'purchase_receipt'`) at the
  receipt's branch, links each line's `inventoryMovementId`, and marks the
  receipt `'completed'`. Idempotent (safe to re-run).
- `lib/warehouse/service.ts::postStockTransfer` — posts a `stock_transfers`
  row's lines as a paired `transfer_out`/`transfer_in` movement (source/
  destination branch), links `fromMovementId`/`toMovementId`, marks the
  transfer `'completed'`. Idempotent. A transfer that would oversell the
  source branch is still recorded, not blocked — same policy as
  `docs/design-spikes/01-conflict-resolution.md`.

`inventory_movements.reason`/`sourceType` gained `'purchase_receipt'` and
(`sourceType` only) `'stock_transfer'` — no migration was needed since these are
plain `text` columns with a TypeScript-level enum, not a Postgres `CHECK`
constraint.

**Not yet linked:** accounting postings (supplier invoice, sale invoice, payroll
→ journal entries) — this needs a new `account_mappings` table (which chart-of-
accounts account is "accounts payable", "inventory asset", etc. for a given
tenant) and is a separate, larger piece of design work than the inventory-side
linking above. Deferred until the founder scopes it explicitly.

## What is explicitly deferred (not built in this phase)

- **No live Salla webhook route.** `app/api/health/route.ts` is the only live
  endpoint. The Salla connector is exercised by unit tests against fixture
  payloads only.
- **No PWA / offline client.** The offline-first requirement from the design doc
  is addressed at the contract level (`lib/sync/types.ts`,
  `docs/design-spikes/02-offline-reconciliation.md`) — no browser code, service
  worker, or local storage queue exists yet.
- **No UI of any kind.**
- **No Zid/Shopify connector implementation** — the interface supports adding one
  later without touching the ledger core, but zero demand evidence exists for
  either platform (see the design doc), so none is built now.
- **No posting/business logic for accounting, purchasing, marketing, or HR.**
  All of these modules exist as schema only in this phase — no service layer,
  no route handlers, no validation of cross-table invariants (e.g. nothing
  enforces that a `journal_entries` row's lines actually balance, or that a
  `goods_receipt_lines` row's `inventoryMovementId` gets populated). Only
  `lib/ledger/service.ts` (inventory + invoicing) has real read/write logic.
- **No Zakat/tax compliance (ZATCA) implementation** — flagged in the design
  doc as requiring dedicated legal/compliance research before any build.
- **No OAuth implementation.** `luvano-dashboard/lib/salla-client.ts` and
  `lib/auth.ts` already implement Salla OAuth (token exchange + refresh) and
  work correctly — this will be reused/ported when the live webhook route is
  built, not rebuilt from scratch.
- **No RBAC / user auth system.** `lib/tenancy/context.ts` defines the contract
  a future request handler will use to resolve which tenant a request belongs
  to; no session/auth system backs it yet.

## Why schema-only, not live integration

The design doc's "Demand Evidence" section flags that external, paying-customer
validation has not happened yet — the only evidence so far is the founder's own
prior-employer experience. "The Assignment" in the design doc calls for 3 real
customer conversations before further build investment. This phase deliberately
produces schema + contracts + design decisions (reviewable, low-cost-to-change)
rather than a live integration (expensive to change once real data flows through
it), so validation and architecture work can proceed in parallel without
compounding the risk of building the wrong thing quickly.

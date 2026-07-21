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

## Accounting ↔ inventory linking

Founder-directed follow-up: link accounting to the purchasing/sales documents
above via automatic journal entries. `lib/accounting/service.ts` is the fourth
service module (alongside ledger, purchasing, warehouse):

- **`account_mappings`** (new table) solves "which chart-of-accounts account is
  'accounts payable' for this tenant" — a fixed set of keys
  (`db/schema/account-mappings.ts::accountMappingKeys`: cash,
  accounts_receivable, accounts_payable, inventory_asset, sales_revenue, cogs,
  input_tax, output_tax_payable, salary_expense, salary_payable), one
  `chart_of_accounts` row mapped per key per tenant. Without this, automatic
  posting has no way to know which account to hit — every tenant builds a
  different chart of accounts.
- **`postJournalEntry`** is the generic poster every specific posting function
  goes through: validates `sum(debit) === sum(credit)` **before writing
  anything** (throws otherwise) — this is the invariant `journal-entries.ts`'s
  schema comment flagged as "an application-layer responsibility, not a DB
  constraint," now actually enforced. Idempotent via a new partial unique index
  `journal_entries_tenant_source_idx` on `(tenant_id, source_type,
  source_reference) WHERE source_reference IS NOT NULL` (manual entries, which
  have no source_reference, are unaffected by the constraint).
- **`postSupplierInvoiceJournal`** — debit `inventory_asset` (+ `input_tax` if
  any), credit `accounts_payable`. Links `supplier_invoices.journalEntryId`.
- **`postSupplierPaymentJournal`** — debit `accounts_payable`, credit `cash`.
  Links `supplier_payments.journalEntryId`, and recomputes
  `supplier_invoices.status` (`unpaid`/`partially_paid`/`paid`) from the sum of
  all payments linked to that invoice.
- **`postSaleInvoiceJournal`** — debit `cash`, credit `sales_revenue` (+
  `output_tax_payable` if any). **Deliberately no COGS line** — the founder
  chose "revenue + tax only for now" specifically because there's no inventory
  costing method (e.g. weighted-average cost) yet; adding a COGS line without
  one would require picking a costing method as an unplanned side effect. This
  is a scoped, temporary gap, not an oversight — it's the natural next
  extension once costing is designed. `sale_invoices.journalEntryId` (new
  column) is set once posted.

**Still not linked:** payroll → journal entries (schema already has
`payroll_entries.journalEntryId` reserved, but no posting function exists
yet — out of scope for this round, which focused on accounting↔inventory
specifically per the founder's request).

## Costing foundation (weighted-average)

Founder-directed follow-up, immediately after the accounting↔inventory linking
above — this is what unblocked the COGS gap that section deliberately left
open.

- **`inventory_balances.averageCost`** (new column, `numeric(14,4)`) — extra
  decimal precision versus the usual `(12,2)` money columns, because repeated
  weighted-average blending accumulates rounding otherwise.
- **`lib/ledger/balance.ts::applyInventoryDeltaWithCost`** — same atomic
  upsert as `applyInventoryDelta`, plus cost blending *only* when both
  `delta > 0` and a `unitCost` is given. A decrease (sale, transfer-out,
  adjustment) never touches `averageCost` — that's standard weighted-average
  costing (cost-per-unit doesn't change when units leave, only when new ones
  arrive at a different cost). If the *current* quantity is `<= 0` (e.g. after
  an earlier oversell), blending against it is meaningless, so the incoming
  unit cost replaces it as a fresh baseline instead.
  - **Postgres gotcha hit and fixed:** the blend `CASE` expression mixes bound
    parameters on both sides of `*`/`/`, which pglite (and Postgres generally)
    can't type-resolve — `operator is not unique: unknown * unknown`. Fixed
    with explicit `::numeric` casts on every parameter in that expression.
- **Wired into two call sites:**
  - `lib/purchasing/service.ts::postGoodsReceipt` — blends using each line's
    `goods_receipt_lines.unitCost`.
  - `lib/warehouse/service.ts::postStockTransfer` — reads the *source*
    branch's average cost before moving anything, and blends that cost into
    the *destination* branch's balance (the cost basis moves with the stock).
    The `transfer_out` side never touches cost, matching the decrease rule.
- **`lib/accounting/service.ts::postSaleInvoiceJournal`** now adds a
  `debit cogs / credit inventory_asset` line pair, sized from
  `sum(line.quantity * current averageCost)` across the invoice's
  `sale_invoice_lines` — omitted entirely when that sum is 0 (e.g. a sale
  posted before any purchase ever set a cost). **Known simplification, not a
  bug:** this uses the average cost *as it stands at posting time*, not frozen
  at the moment of sale — `sale_invoice_lines` has no cost column to freeze
  it. If purchases happen between the sale and when this journal gets posted,
  the COGS figure reflects the current average, not the historical one at
  sale time. Fixing this properly would mean adding a cost snapshot to
  `sale_invoice_lines` at invoice-creation time in `lib/ledger/service.ts` —
  deferred, not requested this round.

## Branch-level financial reporting

Founder-directed: every branch needs its own reportable P&L and balance sheet.
Two schema additions close a gap this required, and a new `lib/reporting/`
module does the actual aggregation:

- **`branches.accountingCode`** (new, nullable, unique per tenant when set) —
  the branch's reference number *as a reporting dimension*, distinct from
  `branches.code` (which already serves as the de facto warehouse number,
  since every branch — not just `type: 'warehouse'` ones — already tracks its
  own stock via `inventory_balances` keyed by `branch_id`). No new
  "warehouse number" field was needed; one already existed.
- **`supplier_invoices.branchId` / `supplier_payments.branchId`** (new,
  nullable) — these documents previously had no *direct* branch link (only an
  optional, indirect one via `purchaseOrderId`), so `journal_entries.branchId`
  came out null for anything posted through
  `postSupplierInvoiceJournal`/`postSupplierPaymentJournal`. Fixed by wiring
  these new columns straight into `postJournalEntryInTx`'s `branchId`
  argument — `sale_invoices` already had a mandatory `branchId`, so the sales
  side needed no schema change, just the reporting layer below.
- **`lib/reporting/service.ts`** — `getBranchProfitAndLoss(tenantId, branchId,
  dateFrom, dateTo)` and `getBranchBalanceSheet(tenantId, branchId,
  asOfDate)`, both aggregating `journal_entry_lines` (joined to
  `journal_entries` and `chart_of_accounts`) filtered by
  `journal_entries.branchId` and `status = 'posted'`. Revenue/liability/equity
  amounts are `credit - debit` per account (their normal balance side);
  asset/expense amounts are `debit - credit`.

**Important framing, not a limitation to fix:** a per-branch balance sheet
isn't a legally separate financial statement — assets, liabilities, and
equity belong to the company as a whole, not to one branch. What this module
actually provides is the **branch dimension already present on every
auto-posted journal entry**, filtered into a P&L/balance-sheet *shape* for
internal management reporting — the same approach Odoo calls "Analytic
Accounting" and every serious multi-branch retail ERP offers. This is exactly
what "أقدر أطلع منه تقارير أرباح وخسائر وميزانية" (the founder's own framing)
means in practice, and is the right amount of rigor for this phase.

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
- **`lib/tenancy/context.ts` is now superseded, not deleted.** Written in
  Phase 1 as a placeholder contract for a future auth system — RBAC (below)
  is that system, and it resolves tenancy via `lib/authz/service.ts`, not
  this file. Left in place as dead code rather than removed mid-session;
  worth deleting in a follow-up cleanup pass.

## RBAC / Authentication (Phase 1 of ROADMAP.md, implemented)

Founder-directed, planned via `/plan-eng-review`, then implemented in the same
session. Real code, not schema-only — the first part of this codebase
actually reachable via an HTTP request (`/api/onboarding`,
`/api/auth/[...all]`), not just pglite-tested service functions.

- **Better Auth** (`lib/auth/server.ts`) — chosen over building custom
  session/JWT auth or using Auth.js/NextAuth, per the review's Layer-1 search
  (current best practice for Next.js + Drizzle + Neon). Its `organization`
  plugin provides multi-tenancy + membership out of the box.
- **`tenants.id` stays the single tenancy reference**, not Better Auth's own
  `organization.id` — `organization` gets a hand-added `tenantId` column
  (uuid, FK to `tenants.id`) instead. None of the 32 pre-existing
  `tenant_id`-scoped tables needed a migration.
- **4 roles**: `owner`, `accountant`, `branch_manager`, `staff`
  (`lib/authz/types.ts::Role`). `branch_manager`/`staff` are branch-scoped
  from day one via a `branchAccess` field on `member`
  (`{"type":"all"}` or `{"type":"list","branchIds":[...]}` — two genuinely
  different shapes, not "a list that happens to contain everything").
- **Defense in depth**: `proxy.ts` (Next.js 16 renamed `middleware.ts` →
  `proxy.ts`, function `middleware` → `proxy`) does a fast, DB-free cookie
  check per request; `lib/authz/service.ts::assertRole`/`assertBranchAccess`
  is called again inside services, since webhooks/cron reach services
  directly without ever passing through the HTTP middleware layer.
  `SYSTEM_CONTEXT` (a real exported symbol, not a magic string) is the
  explicit bypass identity for those non-HTTP callers — there is no implicit
  "missing context means allow" path.
- **Short sessions (30 min) + fast renewal window**, not long-lived tokens —
  a revoked/changed membership takes effect on next renewal instead of
  lingering.
- **Provisioning** (`lib/auth/provisioning.ts`): signup creates a `tenants`
  row, a Better Auth `organization` row linked to it, and a `member` row with
  `role: 'owner'`, `branchAccess: {"type":"all"}` — all in one transaction.
  Salla connection (a separate, still-unbuilt initiative) does **not**
  auto-create a tenant; a merchant must provision here first.

**Real bugs hit and fixed while implementing this (not hypothetical, not
caught by review — caught by actually running the code):**
1. `drizzle-orm@0.36.4` didn't satisfy Better Auth's peer requirement
   (`^0.45.2`) — upgraded `drizzle-orm`/`drizzle-kit`, then re-ran the full
   46-test suite to confirm nothing broke before proceeding.
2. Better Auth's schema generator crashes trying to serialize a JSON-string
   `defaultValue` containing embedded double-quotes (`'{"type":"all"}'`) —
   worked around by removing the default entirely; there's no single correct
   default role/branchAccess anyway, the provisioning/invite flow must always
   set both explicitly.
3. `organization.tenantId` was generated as `text`, but `tenants.id` is
   `uuid` — Postgres rejected the FK ("Key columns ... are of incompatible
   types"). Fixed by typing the hand-added column as `uuid` (it's ours, not
   a Better Auth core column, so changing it was safe).
4. A first draft of the session-activation update in
   `lib/auth/provisioning.ts` had no `.where()` clause — would have
   reassigned `activeOrganizationId` on every session in the entire
   database, not just the new user's. Caught before it shipped, not after.
5. `lib/auth/db.ts` originally threw at module-load time if `DATABASE_URL`
   was unset — which broke `next build` itself (page-data collection runs
   with `NODE_ENV=production` and no real secrets in most build
   environments), not just runtime requests. Fixed by making the Postgres
   connection lazy (constructed on first real query, via a `Proxy`), so a
   missing `DATABASE_URL` only fails when something actually queries, not on
   import.
6. Next.js 16 renamed the `middleware.ts` convention to `proxy.ts` (function
   `middleware` → `proxy`) — caught by the build itself failing with a clear
   message, not a guess in advance.

**Not yet built** (see `ROADMAP.md` Phase 1 task list, T7/T8 remaining):
wiring `assertRole`/`assertBranchAccess` into the 5 existing services
(ledger, purchasing, warehouse, accounting, reporting) — they don't check
authorization yet, this phase only built the auth/authz foundation itself —
and an audit trail for denied access attempts.

## Product variants (Phase 1.5, module 1 of 6 — implemented)

Founder-directed: some categories (clothing, shoes) need a product to have
color/size variants, each with its own SKU, while reports and offers can
target either the parent (covers every variant) or one specific variant
(e.g. "discount only on size 40, black").

- **`products`** (parent) + **`product_variants`** (child, the actual SKU
  holder) — `db/schema/products.ts`, `db/schema/product-variants.ts`.
  `attributes` is a generic `jsonb` key-value (`{"color":"black","size":"40"}`),
  not fixed color/size columns, since variant axes differ by business type.
- **Every product gets at least one variant row**, including simple
  (non-variant) products — this is what let the existing 8 SKU-bearing
  tables (`inventory_movements`, `inventory_balances`, `sale_invoice_lines`,
  `purchase_order_lines`, `goods_receipt_lines`, `supplier_invoice_lines`,
  `stock_transfer_lines`, `reconciliation_alerts`) stay completely
  unchanged — no migration needed on any of them.
- **Deliberately no FK** from those 8 tables' `sku` columns to
  `product_variants.sku` — this table is a reference/lookup catalog (name,
  category, attributes for a SKU), not an enforced referential-integrity
  constraint. A SKU can exist in inventory before it's registered here, same
  as before this module existed. Trade-off made explicitly to avoid
  migrating 8 already-built, already-tested tables for this module.
- **`lib/products/service.ts::resolveSkusForTarget`** is the founder's exact
  requirement made concrete: given `{ type: 'product', productId }` it
  returns every child SKU; given `{ type: 'variant', variantId }` it returns
  exactly one. This is what a future coupon/campaign (module 2, marketing —
  not built yet) or a future SKU-level report will call to resolve what it
  actually applies to.

8 tests. No live route/UI — same phase-appropriate scope as every other
module so far (schema + real service logic, exercised via pglite).

## Marketing & Offers (Phase 1.5, module 2 of 6 — implemented)

Moved from schema-only to real logic — `lib/marketing/service.ts`. Directly
reuses module 1's `resolveSkusForTarget` (imports `createProductsService`),
which is exactly why product variants was sequenced first.

- **`coupons` gained `targetProductId`/`targetVariantId`** (both nullable;
  at most one set — enforced at the application layer, not a DB CHECK,
  matching this schema's existing convention for cross-field invariants).
  `NULL`/`NULL` means the coupon applies to the whole cart.
- **`validateCoupon`** is read-only (checks active/date-range/max-uses/
  min-order, resolves eligible cart lines via the target, computes the
  discount from those lines only — not the full cart) — call it before
  checkout. **`redeemCoupon`** is the only function that consumes a use,
  via the same atomic-guarded-UPDATE pattern as
  `lib/ledger/balance.ts::applyInventoryDelta` (`WHERE ... uses_count <
  max_uses` evaluated by Postgres against the current row, not a
  read-then-write check) — a concurrency test with 8 simultaneous
  redemptions against `maxUses: 5` proves exactly 5 succeed, not more.
- **Fixed-amount discounts are capped at the eligible subtotal** (never
  produce a negative line total) — e.g. a 500 SAR coupon against a single
  30 SAR eligible line discounts 30, not 500.
- **`minOrderAmount` checks the whole cart**, regardless of targeting — a
  "10% off the black size-40 shirt" coupon can still require the overall
  order to reach a minimum, a deliberate real-world rule, not an oversight.

12 tests (concurrency, targeting-to-variant, targeting-to-product,
untargeted, all the rejection reasons). No live route/UI yet.

## Customers (Phase 1.5, module 3 of 6 — implemented)

Moved from schema-only to real logic — `lib/customers/service.ts`.

- **New `customer_interactions` table** (`type`: call/note/complaint/
  follow_up, `summary`, `createdBy`, indexed on `(tenant_id, customer_id)`).
  This is deliberately separate from `sale_invoices` — that table already
  records *transactions* with a customer (`customerId` FK, added when the
  `customers` table was first created); this one records human *contact*
  around a customer that can't be derived from invoice rows (a phone call,
  a complaint, a follow-up note).
- **CRUD is tenant-scoped on every read/write** (`createCustomer`,
  `updateCustomer`, `getCustomer`, `listCustomers`) — `updateCustomer`
  throws if the `(tenantId, customerId)` pair doesn't match a row, so one
  tenant can never edit another tenant's customer even with a guessed id.
- **`listInteractions` returns newest-first** (`ORDER BY created_at DESC`)
  — matches how a CRM timeline is actually read.

7 tests (CRUD, cross-tenant isolation on update/get/list, interaction
logging, interaction listing scoped to one customer). No live route/UI yet.

## Human Resources (Phase 1.5, module 4 of 6 — implemented)

Moved from schema-only to real logic — `lib/hr/service.ts`. Reuses the
accounting module's internal `postJournalEntryInTx` directly (now exported
from `lib/accounting/service.ts`, same as `applyInventoryDeltaWithCost` is
exported from `lib/ledger/balance.ts` for other modules to call inside
their own transaction) rather than composing whole services, so the
journal entry and the `payroll_entries.journalEntryId` backfill commit
atomically in one transaction.

- **`processPayrollRun` snapshots, it doesn't reference live data** — each
  active employee's `baseSalary` at the moment of processing (plus any
  per-employee `allowances`/`deductions` override) is copied into a new
  `payroll_entries` row. A later raise to `employees.baseSalary` never
  retroactively changes an already-processed run's figures — this is the
  correct behavior for payroll, not an oversight.
- **A run can only be processed once** (`status` must be `'draft'`,
  flips to `'processed'` in the same transaction as the entry inserts) —
  reprocessing would double-pay every employee.
- **`postPayrollJournal` posts one journal entry per run, not one per
  employee** (debit `salary_expense` / credit `salary_payable`, sized
  from `sum(netPay)` across the run's entries) — matches how a real
  payroll batch reads on the books. Idempotent via the same
  `sourceType`+`sourceReference` uniqueness `postSupplierInvoiceJournal`
  already relies on — added `'payroll'` to `journal_entries.sourceType`
  for this (a `text` enum at the TypeScript level only, no Postgres
  `CHECK` constraint, so this required no migration).
- **`salary_expense`/`salary_payable` account_mappings keys already
  existed** in the schema from when `payroll_entries.journalEntryId` was
  first reserved — module 4 is the first to actually use them.

6 tests (snapshot correctness, active-only filtering, reprocess rejection,
balanced posting, idempotent re-posting, posting-before-processing
rejection). No live route/UI yet.

Also fixed a real flake found while running this module's tests: as the
suite grew past ~17 pglite-backed files, `vitest.config.ts`'s existing
`pool: 'forks'` isolation (see the note in that file) started hitting
occasional "Worker exited unexpectedly" crashes under full parallelism —
too many concurrent WASM instances competing for memory. Capped with
`poolOptions.forks.maxForks: 4`; reproduced the crash twice before the
fix, clean on every run after.

## Purchasing — full PO lifecycle (Phase 1.5, module 5 of 6 — implemented)

Extends `lib/purchasing/service.ts` beyond `postGoodsReceipt` (already
built earlier) with the rest of the draft→sent→received flow. The old
`postGoodsReceipt` body was extracted into an internal `postGoodsReceiptInTx`
so both the standalone entry point and the new PO-driven path share one
implementation instead of drifting.

- **`createPurchaseOrder`** inserts a PO + lines in `'draft'`.
  **`sendPurchaseOrder`** flips `draft → sent`, and rejects anything not
  currently `draft` — a sent/received/cancelled PO can't be "sent" again.
- **`receivePurchaseOrder`** is the PO-lifecycle counterpart of
  `postGoodsReceipt`: it creates a `goods_receipt` + lines against an
  existing PO (rejecting any sku not on that PO), posts inventory for it
  via the shared `postGoodsReceiptInTx`, then recomputes the PO's status
  from **cumulative received quantity vs ordered quantity per line**,
  summed across every completed receipt linked to that PO — not just the
  one just posted. This is what makes **partial shipments** work
  correctly: receiving 6 of 10 ordered units sets `partially_received`;
  a second receipt for the remaining 4 sets `received`, and the
  inventory balance ends up at 10 either way (verified by a test that
  receives across two separate calls).
- **Receiving against an already-`received`/`cancelled` PO is rejected**
  — there's no legitimate reason to receive more once a PO is closed.

8 tests total in `tests/purchasing/service.test.ts` (2 pre-existing +
6 new: PO creation, send/re-send rejection, full receipt in one shipment,
partial-then-complete across two shipments, unknown-sku rejection,
receiving-against-closed-PO rejection). No live route/UI yet.

## Company-wide consolidated report (Phase 1.5, module 6 of 6 — implemented, Phase 1.5 complete)

Extends `lib/reporting/service.ts` with `getCompanyProfitAndLoss` and
`getCompanyBalanceSheet` — the whole-company view requested once every
per-branch report was confirmed working.

- **`aggregateByAccount`'s `branchId` parameter became optional**
  (`string | undefined`) instead of adding a parallel code path —
  omitting it drops the `journal_entries.branchId` filter, so the same
  aggregate query naturally covers "every branch of this tenant." This
  is one aggregate query over the whole tenant's posted lines, **not**
  a sum of the per-branch reports called separately — it can't drift
  from a branch total if a branch is added or removed mid-period, and
  it costs one query instead of N.
- Tenant isolation is still enforced the same way as every other query
  in this file (`journal_entries.tenantId` in the `WHERE`) — verified
  with a test seeding a second tenant with a 9000 SAR sale and
  confirming it never appears in the first tenant's company total.

7 tests total in `tests/reporting/service.test.ts` (4 pre-existing +
3 new: company P&L sums across branches, company P&L tenant isolation,
company balance sheet sums cash across branches). No live route/UI yet.

**This closes Phase 1.5** — all 6 modules (product variants, marketing,
customers, HR, purchasing PO lifecycle, company report) are now built
past schema-only into real service logic with test coverage, per the
founder's explicit sequencing. Next up per `ROADMAP.md`: RBAC T7/T8
(wiring `assertRole`/`assertBranchAccess` into the 5 existing services,
plus a denied-access audit trail), then Phase 2 (live Salla webhook
integration, plan already locked and simply paused until this point).

## Why schema-only, not live integration

The design doc's "Demand Evidence" section flags that external, paying-customer
validation has not happened yet — the only evidence so far is the founder's own
prior-employer experience. "The Assignment" in the design doc calls for 3 real
customer conversations before further build investment. This phase deliberately
produces schema + contracts + design decisions (reviewable, low-cost-to-change)
rather than a live integration (expensive to change once real data flows through
it), so validation and architecture work can proceed in parallel without
compounding the risk of building the wrong thing quickly.

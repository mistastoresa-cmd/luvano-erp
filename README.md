# Luvano ERP — Ledger Service

Started as Phase 1 of the Luvano ERP build (the validated wedge: real-time
Salla↔branch inventory sync + unified invoicing) and has grown, by explicit
founder direction, into a working core across five services: ledger,
purchasing, warehouse, accounting, and branch reporting. See
`docs/ARCHITECTURE.md` for the full, honest breakdown of what has real
read/write logic versus schema-only, and the approved design doc at
`~/.gstack/projects/Luvano-ERP/abdullahbaaqil-unknown-design-20260719-164841.md`
for the original product context (some of its phasing has since been
superseded by founder decisions — `docs/ARCHITECTURE.md` is the up-to-date
source of truth, the design doc is the historical record).

Relationship to `luvano-dashboard` (the existing production analytics app at
`/Users/abdullahbaaqil/luvano-dashboard`): separate, untouched. This service will
eventually be consumed by the dashboard as a read-client, feature by feature —
not a rewrite of it.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL for a real Neon instance
npm run db:generate           # generates SQL migrations from db/schema/*
npm run test                  # runs against in-memory pglite, no DATABASE_URL needed
npm run build
```

Tests use `pool: 'forks'` in `vitest.config.ts` — each file gets its own
process so its in-memory pglite (WASM Postgres) instance is fully reclaimed
when the file finishes. The default `threads` pool caused sporadic "Worker
exited unexpectedly" crashes once enough pglite-backed test files
accumulated; don't switch it back without re-verifying that's fixed.

## Structure

- `db/schema/` — Drizzle table definitions across 8 modules (see
  `docs/ARCHITECTURE.md` for the full breakdown).
- `lib/ledger/` — inventory movements + unified invoicing (the original
  wedge), plus the weighted-average costing primitives (`balance.ts`) and
  oversell-alert policy (`alerts.ts`) every other service shares.
- `lib/purchasing/` — posts goods receipts as inventory increases.
- `lib/warehouse/` — posts stock transfers as paired inventory movements,
  carrying cost from source to destination branch.
- `lib/accounting/` — posts journal entries for supplier invoices, supplier
  payments, and sale invoices (with COGS); `account_mappings` resolves which
  chart-of-accounts account plays which role per tenant.
- `lib/reporting/` — branch-level P&L and balance-sheet aggregation over
  posted journal entries.
- `lib/connectors/` — platform-agnostic ingestion interface + Salla adapter
  (not wired to a live route yet).
- `lib/sync/` — server-side contract for the future offline-sync PWA.
- `docs/design-spikes/` — conflict-resolution and offline-reconciliation
  strategies.

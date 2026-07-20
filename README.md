# Luvano ERP — Ledger Service

Phase 1 of the Luvano ERP build: database schema, service interfaces, and two
design-spike documents for the validated wedge (real-time Salla↔branch inventory
sync + unified invoicing). See `docs/ARCHITECTURE.md` for what's built vs.
deferred in this phase, and the approved design doc at
`~/.gstack/projects/Luvano-ERP/abdullahbaaqil-unknown-design-20260719-164841.md`
for the full product context.

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

## Structure

- `db/schema/` — Drizzle table definitions (tenants, branches, inventory
  balances/movements, sale invoices/lines, sync batches, reconciliation alerts).
- `lib/connectors/` — platform-agnostic ingestion interface + Salla adapter.
- `lib/ledger/` — the ledger's core read/write service and atomic balance logic.
- `lib/sync/` — server-side contract for the future branch-sync API.
- `docs/design-spikes/` — conflict-resolution and offline-reconciliation
  strategies.

# TODOs

Captured during `/plan-eng-review` of the RBAC/auth plan (2026-07-21). Each
item surfaced by the outside-voice cross-model review as additive (doesn't
contradict a decision already locked in `docs/ARCHITECTURE.md`), so deferred
here rather than blocking the RBAC plan itself.

## 1. `assertBranchAccess` needs a real data shape, not just a function signature

**What:** Design the "which branches can this user see" value properly:
`'all'` for owner/accountant, `string[]` (branch IDs) for branch_manager/staff.
**Why:** The plan named the function (`assertBranchAccess(userId, branchId)`)
but not what "the user's accessible branches" looks like as data — owner and
branch_manager need fundamentally different shapes, not the same list with
more entries.
**Pros:** Small, well-scoped design task; unblocks writing `lib/authz/` for real.
**Cons:** None — this has to be decided before `lib/authz/` can be implemented anyway.
**Context:** Surfaced by the outside-voice review during `/plan-eng-review`.
Lives in `lib/authz/` alongside `assertRole`/`assertBranchAccess`, both of
which are locked decisions from this review.
**Depends on:** Nothing — do this first when implementation starts.

## 2. Retrofit cost estimate for wiring authz into the 5 existing services

**What:** Before implementing, estimate the actual diff size for threading
`userId`/`SYSTEM_CONTEXT` through `lib/ledger`, `lib/purchasing`,
`lib/warehouse`, `lib/accounting`, `lib/reporting` — all currently
authz-unaware and covered by 44 passing tests.
**Why:** The outside-voice review flagged this as "a breaking change to
already-built, already-tested code, not a clean bolt-on" — worth sizing
before committing to the defense-in-depth approach across all 5 services in
one pass, versus rolling it out service-by-service.
**Pros:** Prevents a surprise-sized PR; each service's test suite tells you
immediately if a signature change broke something.
**Cons:** Adds an estimation step before coding starts.
**Context:** Surfaced by the outside-voice review. The defense-in-depth
decision itself was reaffirmed (kept, not reduced) in this review — this TODO
is about sequencing the retrofit, not revisiting whether to do it.
**Depends on:** TODO #1 (need the data shape before estimating the signature changes).

## 3. Tenant/user provisioning flow (signup → create org → bootstrap first owner)

**What:** Design and build the actual signup path: new company signs up,
creates their `tenants` row (now the single source of truth per this
review's decision), and the first user becomes `owner`.
**Why:** Without this, nobody can create a session to even test the RBAC
being built — there's currently no UI and no route for it. The outside-voice
review flagged this as completely unaddressed.
**Pros:** Unlocks actually exercising the RBAC work end-to-end instead of
only against pglite fixtures (the same "never run against a real request"
gap flagged for the existing 44 tests).
**Cons:** Slightly expands scope beyond "just RBAC" into a thin route layer —
acceptable since it's the only way to verify RBAC for real.
**Context:** Surfaced by the outside-voice review's "sequencing failure"
point. Probably the natural first real route handler in the codebase.
**Depends on:** Better Auth + `tenants`-as-reference decisions from this review.

## 4. Audit trail for authorization denials on financial data

**What:** Log who was denied access to what (which user, which branch/role
check, which resource) — not just allow/deny in the moment.
**Why:** This is accounting software with role-gated financial visibility
(staff can't see P&L, branch_manager can't see other branches). Cheaper to
bake in at RBAC-build time than retrofit onto financial data later.
**Pros:** Standard expectation for ERP/financial software; useful for
debugging authz bugs during development too.
**Cons:** Extra table + write path; adds latency to the hot authz-check path
(mitigate with async/fire-and-forget logging).
**Context:** Surfaced by the outside-voice review. Not a blocker for the
first working version of RBAC, but shouldn't be deferred indefinitely once
real financial data flows through it.
**Depends on:** RBAC itself existing first.

## 5. Spike: verify Better Auth's session-extension story against our Drizzle/Neon setup

**What:** Before deep implementation, do a small throwaway spike confirming
Better Auth's plugin system can actually attach custom session data (the
cached branch-access list from this review's performance decision) cleanly
against our existing Drizzle schema conventions.
**Why:** The outside-voice review flagged this as "the highest technical-risk
unknown in the whole proposal" — the plan treated it as settled when it
hasn't been verified against this specific codebase.
**Pros:** Cheap to de-risk early (a few hours) versus discovering a fit
problem mid-implementation.
**Cons:** None — this is exactly what a spike is for.
**Context:** Surfaced by the outside-voice review. Should run **before**,
not after, wiring authz into the 5 existing services (TODO #2) — if the
session-extension approach doesn't fit, the perf/invalidation design from
this review (short sessions + immediate invalidation) may need revisiting.
**Depends on:** Nothing — do this first, alongside or before TODO #1.

---

## Live Salla webhook integration — from `/plan-eng-review` (2026-07-21)

## 6. Token refresh flow for `salla_connections`

**What:** Cron or on-demand refresh of Salla access tokens before `expiresAt`,
using the stored (encrypted) refresh token.
**Why:** Without this, the connection silently stops working when the token
expires — and the planned follow-up (fetching order details for refunds
missing line-items, TODO #7) needs a valid token to call Salla's API at all.
**Depends on:** `salla_connections` table existing.

## 7. Key management policy for token encryption

**What:** Move beyond "AES-256 key from an env var" — define rotation policy,
consider a secrets manager, and plan for re-encrypting stored tokens if the
key ever rotates.
**Why:** Outside-voice review: "storing live merchant OAuth credentials... is
not a policy" as currently described. Low urgency pre-launch, real risk once
real merchant tokens are stored.
**Depends on:** `salla_connections` existing.

## 8. Handle Salla app-uninstall/deauthorize webhook event

**What:** Listen for Salla's uninstall event, deactivate the matching
`salla_connections` row, stop processing further webhooks for that store.
**Why:** Without this, Luvano keeps dead-lettering (or worse, processing)
events for stores that revoked access.
**Depends on:** `salla_connections` + webhook event router existing.

## 9. Observability for silently-dropped refunds

**What:** Metric/alert when an `order.status.updated` refund event arrives
with no line items (the known gap — connector currently returns `[]`).
**Why:** Without this, a real refund vanishes from the books with zero
signal until a merchant notices their numbers don't match Salla's dashboard.
**Depends on:** Webhook service existing.

## 10. Reconciliation/backfill for missed or out-of-order webhook events

**What:** A periodic job that compares Luvano's ledger against Salla's order
list (via API) to catch events lost during downtime or delivered out of order.
**Why:** Webhooks aren't guaranteed ordered or lossless — a deploy-window gap
or a redelivery race could silently miss a real order.
**Depends on:** Live webhook integration running in production first —
building this before there's real traffic to reconcile against is premature.

## 11. Saudi PDPL data-residency/retention review for customer PII from Salla orders

**What:** Legal/compliance research on data-residency and retention
requirements for customer PII (name, phone, address) now flowing in from
Salla orders — same category of work as the ZATCA compliance note in
`docs/ARCHITECTURE.md` (dedicated research, not sized as regular engineering).
**Why:** This is a live regulatory concern in the Saudi market, not
hypothetical, once real customer data starts flowing through the system.
**Depends on:** Nothing — can start in parallel with implementation.

## 12. Connection-pool exhaustion risk under Neon serverless during traffic bursts

**What:** Load-test webhook processing under a simulated flash-sale burst
(concurrent requests each holding a transaction across inventory + accounting
writes) against Neon's serverless connection limits.
**Why:** Outside-voice review: a burst "can cascade into connection
exhaustion for the whole tenant, not just slow individual requests." Deferred
per the sync-processing decision (queue redesign only once real latency data
justifies it) — but should be load-tested, not just assumed fine.
**Depends on:** Webhook integration built and running against at least one
real (sandbox) store first.

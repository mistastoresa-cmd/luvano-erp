// Tenant resolution helper. tenant_id isolation in this phase is enforced at the
// application/query layer (every ledger query filters WHERE tenant_id = $1), not
// via Postgres RLS — this keeps the query layer simple and inspectable while the
// schema is still this small. This function is the single place that resolves
// "which tenant is this request for" so that decision isn't duplicated ad hoc
// across route handlers once they exist.
//
// No live route wiring in this phase (no auth/session system built yet) — this
// is the typed contract a future request handler will call.

export interface TenantContext {
  tenantId: string
}

export function resolveTenantFromHeader(headerValue: string | null): TenantContext | null {
  if (!headerValue || headerValue.trim().length === 0) return null
  return { tenantId: headerValue.trim() }
}

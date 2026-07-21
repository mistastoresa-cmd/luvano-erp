import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { authDb } from '@/lib/auth/db'
import { member, authzDenials } from '@/db/schema'
import type { Db } from '@/db/client'
import { ForbiddenError } from './errors'
import { SYSTEM_CONTEXT, hasBranchAccess } from './types'
import type { CallerContext, Role, BranchAccess } from './types'

// Resolves the caller for the current request: reads the Better Auth
// session, then looks up that user's role/branchAccess for their active
// organization (Better Auth's session row only carries activeOrganizationId
// — role and branchAccess are additionalFields on `member`, not on
// `session`, so this is a second query, not something session lookup gives
// for free). Returns null for no session — callers (middleware, route
// handlers) turn that into a redirect/401; never returns SYSTEM_CONTEXT
// itself, that's only ever constructed explicitly by non-HTTP callers
// (webhooks, cron) that have no session to look up.
export async function resolveCallerContext(headers: Headers): Promise<CallerContext | null> {
  const session = await auth.api.getSession({ headers })
  if (!session?.session.activeOrganizationId) return null

  const [row] = await authDb
    .select({ role: member.role, branchAccess: member.branchAccess })
    .from(member)
    .where(
      and(
        eq(member.userId, session.session.userId),
        eq(member.organizationId, session.session.activeOrganizationId)
      )
    )
    .limit(1)
  if (!row) return null

  return {
    userId: session.session.userId,
    role: row.role as Role,
    branchAccess: JSON.parse(row.branchAccess) as BranchAccess,
  }
}

// Locked in /plan-eng-review: SYSTEM_CONTEXT is an explicit bypass identity
// for non-HTTP callers (Salla webhooks, cron), not an implicit "no context
// means allow" hole — every call site must pass one or the other, there is
// no third "skip the check" option.
export function assertRole(context: CallerContext, allowed: Role[]): void {
  if (context === SYSTEM_CONTEXT) return
  if (!allowed.includes(context.role)) {
    throw new ForbiddenError(`role "${context.role}" is not in [${allowed.join(', ')}]`)
  }
}

export function assertBranchAccess(context: CallerContext, branchId: string): void {
  if (context === SYSTEM_CONTEXT) return
  if (!hasBranchAccess(context.branchAccess, branchId)) {
    throw new ForbiddenError(`user ${context.userId} has no access to branch ${branchId}`)
  }
}

// Fire-and-forget audit write (T8) — never awaited by the caller, and a
// logging failure must never turn a correct denial into a silent allow, so
// it's swallowed rather than propagated. SYSTEM_CONTEXT never reaches here:
// assertRole/assertBranchAccess return early for it, so a denial always has
// a real userId to attribute.
function logDenial(
  db: Db,
  tenantId: string,
  context: Exclude<CallerContext, typeof SYSTEM_CONTEXT>,
  detail:
    | { checkType: 'role'; requiredRoles: Role[] }
    | { checkType: 'branch'; branchId: string },
  message: string
): void {
  void db
    .insert(authzDenials)
    .values({
      tenantId,
      userId: context.userId,
      role: context.role,
      checkType: detail.checkType,
      requiredRoles: detail.checkType === 'role' ? detail.requiredRoles.join(',') : undefined,
      branchId: detail.checkType === 'branch' ? detail.branchId : undefined,
      message,
    })
    .catch(() => {})
}

// What every service call site actually calls — same authorization result
// as assertRole, plus a non-blocking audit-trail write on denial (T8).
// assertRole itself stays a small, synchronous, DB-free pure function on
// purpose (tests/authz/service.test.ts asserts on it directly with
// `expect(() => assertRole(...)).toThrow()`, which requires a synchronous
// throw — an async version would reject a promise instead and silently
// pass that assertion).
export function assertRoleAudited(db: Db, tenantId: string, context: CallerContext, allowed: Role[]): void {
  try {
    assertRole(context, allowed)
  } catch (err) {
    if (err instanceof ForbiddenError && context !== SYSTEM_CONTEXT) {
      logDenial(db, tenantId, context, { checkType: 'role', requiredRoles: allowed }, err.message)
    }
    throw err
  }
}

export function assertBranchAccessAudited(
  db: Db,
  tenantId: string,
  context: CallerContext,
  branchId: string
): void {
  try {
    assertBranchAccess(context, branchId)
  } catch (err) {
    if (err instanceof ForbiddenError && context !== SYSTEM_CONTEXT) {
      logDenial(db, tenantId, context, { checkType: 'branch', branchId }, err.message)
    }
    throw err
  }
}

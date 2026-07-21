import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { authDb } from '@/lib/auth/db'
import { member } from '@/db/schema'
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

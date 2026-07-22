import { cache } from 'react'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { authDb } from '@/lib/auth/db'
import { member, organization } from '@/db/schema'
import type { Role, BranchAccess } from './types'

// Always the authenticated shape — this module never returns SYSTEM_CONTEXT
// (that's the non-HTTP-caller bypass identity, irrelevant to a page render
// with a real logged-in user), so callers get real role/branchAccess
// without re-narrowing the CallerContext union on every access.
type AuthenticatedContext = { userId: string; role: Role; branchAccess: BranchAccess }

// The dashboard layer needs tenantId to scope every query, but
// CallerContext (lib/authz/types.ts) deliberately doesn't carry it — every
// existing service takes tenantId as its own explicit parameter, and adding
// a field to CallerContext would ripple into ~40 test files that construct
// context literals by hand. This is a separate, additive lookup (session ->
// member -> organization.tenantId) that pages call once per request,
// instead of widening the authz core's shape for a UI-only need.
export interface DashboardSession {
  context: AuthenticatedContext
  tenantId: string
  userId: string
  userName: string
  userEmail: string
  organizationId: string
  organizationName: string
}

// Wrapped in React's cache() so the layout and every page under it share
// one lookup per request instead of re-querying auth/member/organization
// on each render — the layout resolves this first, the page below it
// (same Headers reference) gets the memoized result for free.
export const resolveDashboardSession = cache(async function resolveDashboardSession(
  headers: Headers
): Promise<DashboardSession | null> {
  const session = await auth.api.getSession({ headers })
  if (!session?.session.activeOrganizationId) return null

  const [row] = await authDb
    .select({
      role: member.role,
      branchAccess: member.branchAccess,
      tenantId: organization.tenantId,
      organizationName: organization.name,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(
      and(
        eq(member.userId, session.session.userId),
        eq(member.organizationId, session.session.activeOrganizationId)
      )
    )
    .limit(1)
  if (!row) return null

  return {
    context: {
      userId: session.session.userId,
      role: row.role as Role,
      branchAccess: JSON.parse(row.branchAccess) as BranchAccess,
    },
    tenantId: row.tenantId,
    userId: session.session.userId,
    userName: session.user.name,
    userEmail: session.user.email,
    organizationId: session.session.activeOrganizationId,
    organizationName: row.organizationName,
  }
})

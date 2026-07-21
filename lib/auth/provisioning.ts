import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { auth } from './server'
import { authDb } from './db'
import { tenants, organization, member, session } from '@/db/schema'

export interface ProvisionTenantInput {
  ownerName: string
  ownerEmail: string
  ownerPassword: string
  companyName: string
}

export interface ProvisionTenantResult {
  tenantId: string
  organizationId: string
  userId: string
  // Set-Cookie headers from sign-up — the route handler must copy these onto
  // its NextResponse, or the browser never receives the session cookie.
  // `returnHeaders: true` is Better Auth's documented pattern for this exact
  // case (calling auth.api.* server-side outside its own mounted route).
  sessionHeaders: Headers
}

// Locked in /plan-eng-review of the RBAC plan: a merchant creates their
// Luvano-ERP account (this flow) BEFORE connecting Salla — Salla install
// does NOT auto-create a tenant. This is the first real route/service in
// the codebase actually exercised against a live request rather than
// pglite fixtures (see docs/ARCHITECTURE.md's "sequencing failure" note).
//
// Inserts organization/member rows directly via Drizzle rather than going
// through auth.api.createOrganization — that endpoint expects an existing
// session/active-organization context to attach permissions checks to,
// which doesn't exist yet during a brand-new signup. Better Auth's own
// createOrganization handler does the equivalent INSERT under the hood; we
// own this schema, so writing it directly avoids fighting the plugin's
// session-context requirements for this one bootstrap case.
export async function provisionTenant(input: ProvisionTenantInput): Promise<ProvisionTenantResult> {
  const { response: signUpResult, headers: sessionHeaders } = await auth.api.signUpEmail({
    body: { name: input.ownerName, email: input.ownerEmail, password: input.ownerPassword },
    returnHeaders: true,
  })
  const userId = signUpResult.user.id

  const provisioned = await authDb.transaction(async (tx) => {
    const [tenant] = await tx.insert(tenants).values({ name: input.companyName }).returning()

    const slug = `${input.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 8)}`
    const [org] = await tx
      .insert(organization)
      .values({
        id: randomUUID(),
        name: input.companyName,
        slug,
        createdAt: new Date(),
        tenantId: tenant.id,
      })
      .returning()

    await tx.insert(member).values({
      id: randomUUID(),
      organizationId: org.id,
      userId,
      role: 'owner',
      createdAt: new Date(),
      branchAccess: JSON.stringify({ type: 'all' }),
    })

    return { tenantId: tenant.id, organizationId: org.id, userId }
  })

  // The session cookie was already issued (and expires in 30 min per
  // lib/auth/server.ts's short-TTL policy) without knowing about this
  // brand-new organization — activeOrganizationId must be set directly here
  // rather than via a second auth.api.setActiveOrganization call, which
  // expects an existing session to already be attached to the request
  // context (not yet the case mid-provisioning). Scoped to this user's
  // session specifically — an unscoped update() here would silently
  // reassign every tenant's active session in the whole database, a bug
  // caught and fixed while writing this function, not a hypothetical.
  await authDb
    .update(session)
    .set({ activeOrganizationId: provisioned.organizationId })
    .where(eq(session.userId, userId))

  return { ...provisioned, sessionHeaders }
}

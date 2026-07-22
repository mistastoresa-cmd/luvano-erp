import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'
import { authDb } from './db'
import { member } from '@/db/schema'
import * as schema from '@/db/schema'

// Locked in /plan-eng-review of the RBAC plan (2026-07-21):
// - tenants.id is the single tenancy reference (not Better Auth's own
//   organization.id) — organization gets a tenantId field pointing at it,
//   so the 32+ existing tenant_id-scoped tables never need a migration.
// - 4 roles for phase one: owner, accountant, branch_manager, staff.
// - branchAccess is cached on the membership row so lib/authz/ doesn't need
//   a DB round-trip per request — see lib/authz/service.ts.
// - Short sessions + immediate invalidation on branch/role change (resolves
//   the outside-voice-flagged stale-access security hole).
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(authDb, {
    provider: 'pg',
    schema,
  }),
  // Real bug hit running provisionTenant for the first time (nothing had
  // exercised auth.api.signUpEmail end-to-end before the dev seed script):
  // Better Auth disables email/password sign-up by default and rejects it
  // with EMAIL_PASSWORD_SIGN_UP_DISABLED unless explicitly enabled here.
  emailAndPassword: {
    enabled: true,
  },
  session: {
    // Short TTL per the review's "short sessions + immediate invalidation"
    // decision — a revoked/changed membership takes effect on the next
    // renewal instead of lingering for a long-lived session's full duration.
    expiresIn: 60 * 30, // 30 minutes
    updateAge: 60 * 5, // refresh the cookie if used within the last 5 minutes
  },
  // Real bug hit testing the dashboard for the first time: provisionTenant
  // sets activeOrganizationId directly on the signup session (see
  // lib/auth/provisioning.ts), but every ORDINARY sign-in creates a brand
  // new session row with no activeOrganizationId at all — nothing else in
  // Better Auth's organization plugin sets it automatically, so a normal
  // login left resolveDashboardSession() with no org to resolve tenantId
  // from and the dashboard bounced straight back to /login. There's no
  // multi-org-per-user flow yet (every member belongs to exactly one
  // organization), so auto-activating the user's sole membership on every
  // new session is correct today; this will need to become "pick the last-
  // active org" once invitations/multi-tenant membership exist.
  databaseHooks: {
    session: {
      create: {
        async before(session) {
          const [row] = await authDb
            .select({ organizationId: member.organizationId })
            .from(member)
            .where(eq(member.userId, session.userId))
            .limit(1)
          if (!row) return
          return { data: { ...session, activeOrganizationId: row.organizationId } }
        },
      },
    },
  },
  plugins: [
    organization({
      schema: {
        organization: {
          additionalFields: {
            // No `references` metadata here — Better Auth's schema generator
            // only knows about its own models (user/session/organization/...),
            // not our separate `tenants` table, and errors ("Model \"tenants\"
            // not found") if told to reference it. The actual FK to
            // tenants.id is added by hand in the generated migration SQL
            // (see db/migrations/) after `better-auth generate` runs.
            tenantId: {
              type: 'string',
              required: true,
            },
          },
        },
        member: {
          additionalFields: {
            // No defaultValue on either field below: Better Auth's schema
            // generator doesn't escape embedded double-quotes in a JSON
            // defaultValue string (crashed generating this file with a raw
            // '{"type":"all"}' default — real bug hit and worked around, not
            // a hypothetical). There's also no single correct default role
            // anyway — the provisioning flow (lib/auth/provisioning.ts) and
            // invite flow must always set both explicitly per member.
            role: {
              type: 'string',
              required: true,
            },
            // JSON-encoded BranchAccess ({"type":"all"} or
            // {"type":"list","branchIds":[...]}) — see lib/authz/types.ts.
            // Cached here so a session lookup carries it without a second
            // query.
            branchAccess: {
              type: 'string',
              required: true,
            },
          },
        },
      },
    }),
  ],
})

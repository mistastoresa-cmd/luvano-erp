import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization } from 'better-auth/plugins'
import { authDb } from './db'
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
  session: {
    // Short TTL per the review's "short sessions + immediate invalidation"
    // decision — a revoked/changed membership takes effect on the next
    // renewal instead of lingering for a long-lived session's full duration.
    expiresIn: 60 * 30, // 30 minutes
    updateAge: 60 * 5, // refresh the cookie if used within the last 5 minutes
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

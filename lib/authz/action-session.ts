import { headers } from 'next/headers'
import { resolveDashboardSession, type DashboardSession } from './session'

// Shared by every Server Action: resolve the logged-in caller (context +
// tenantId) the same way the dashboard pages do. Throws if unauthenticated —
// actions are only reachable from authenticated pages, and proxy.ts already
// gates the routes, so this is the defense-in-depth backstop.
export async function requireActionSession(): Promise<DashboardSession> {
  const session = await resolveDashboardSession(await headers())
  if (!session) throw new Error('unauthenticated')
  return session
}

export type ActionState = { ok: boolean; error?: string }

export const IDLE_STATE: ActionState = { ok: false }

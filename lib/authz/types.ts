// Locked in /plan-eng-review of the RBAC plan (2026-07-21).

export type Role = 'owner' | 'accountant' | 'branch_manager' | 'staff'

// owner/accountant see every branch in the tenant; branch_manager/staff are
// restricted to specific branches. Two different shapes, not "a list that
// happens to contain everything" — outside-voice review flagged
// assertBranchAccess as needing this distinction explicitly (TODO #1).
export type BranchAccess = { type: 'all' } | { type: 'list'; branchIds: string[] }

// Non-HTTP callers (Salla webhooks, cron jobs) have no authenticated user —
// this is the explicit bypass identity for assertRole/assertBranchAccess,
// not an implicit "no userId means skip the check" hole. See
// /plan-eng-review cross-model tension resolution on webhook identity.
export const SYSTEM_CONTEXT = Symbol('SYSTEM_CONTEXT')
export type CallerContext = { userId: string; role: Role; branchAccess: BranchAccess } | typeof SYSTEM_CONTEXT

export function hasBranchAccess(access: BranchAccess, branchId: string): boolean {
  return access.type === 'all' || access.branchIds.includes(branchId)
}

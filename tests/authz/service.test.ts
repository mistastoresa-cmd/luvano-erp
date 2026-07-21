import { describe, it, expect } from 'vitest'
import { assertRole, assertBranchAccess } from '@/lib/authz/service'
import { SYSTEM_CONTEXT, hasBranchAccess } from '@/lib/authz/types'
import type { CallerContext } from '@/lib/authz/types'

function ctx(overrides: Partial<Exclude<CallerContext, typeof SYSTEM_CONTEXT>> = {}): CallerContext {
  return {
    userId: 'user-1',
    role: 'staff',
    branchAccess: { type: 'list', branchIds: ['branch-1'] },
    ...overrides,
  }
}

describe('hasBranchAccess', () => {
  it('grants access to any branch when type is all', () => {
    expect(hasBranchAccess({ type: 'all' }, 'branch-anything')).toBe(true)
  })

  it('grants access only to listed branches', () => {
    const access = { type: 'list' as const, branchIds: ['branch-1', 'branch-2'] }
    expect(hasBranchAccess(access, 'branch-1')).toBe(true)
    expect(hasBranchAccess(access, 'branch-3')).toBe(false)
  })
})

describe('assertRole', () => {
  it('passes SYSTEM_CONTEXT through unconditionally', () => {
    expect(() => assertRole(SYSTEM_CONTEXT, ['owner'])).not.toThrow()
  })

  it('allows a role that is in the allowed list', () => {
    expect(() => assertRole(ctx({ role: 'owner' }), ['owner', 'accountant'])).not.toThrow()
  })

  it('rejects a role that is not in the allowed list', () => {
    expect(() => assertRole(ctx({ role: 'staff' }), ['owner', 'accountant'])).toThrow(/role "staff"/)
  })
})

describe('assertBranchAccess', () => {
  it('passes SYSTEM_CONTEXT through unconditionally', () => {
    expect(() => assertBranchAccess(SYSTEM_CONTEXT, 'any-branch')).not.toThrow()
  })

  it('allows owner-style "all" access to any branch', () => {
    expect(() =>
      assertBranchAccess(ctx({ role: 'owner', branchAccess: { type: 'all' } }), 'branch-99')
    ).not.toThrow()
  })

  it('allows branch_manager access to their listed branch', () => {
    const context = ctx({ role: 'branch_manager', branchAccess: { type: 'list', branchIds: ['branch-1'] } })
    expect(() => assertBranchAccess(context, 'branch-1')).not.toThrow()
  })

  it('rejects access to a branch outside the list', () => {
    const context = ctx({ role: 'branch_manager', branchAccess: { type: 'list', branchIds: ['branch-1'] } })
    expect(() => assertBranchAccess(context, 'branch-2')).toThrow(/no access to branch/)
  })
})

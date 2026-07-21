export type LeaveType = 'annual' | 'sick' | 'unpaid' | 'other'
export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected'
export type SickPayTier = 'full' | 'three_quarters' | 'unpaid'

export interface AnnualLeaveBalance {
  year: number
  entitlementDays: number
  usedDays: number
  remainingDays: number
}

export interface CreateLeaveRequestInput {
  tenantId: string
  employeeId: string
  leaveType: LeaveType
  startDate: string
  endDate: string
  reason?: string
}

export interface LeaveRequest {
  id: string
  tenantId: string
  employeeId: string
  leaveType: LeaveType
  startDate: string
  endDate: string
  status: LeaveRequestStatus
  reason: string | null
  dayCount: number
  // Only set for leaveType === 'sick' — the wage tier this request falls
  // under per art. 117 (full/three_quarters/unpaid), computed from the
  // employee's already-approved sick days earlier in the same calendar
  // year. Not persisted (see docs/ARCHITECTURE.md) — recomputed on read
  // the same way getAnnualLeaveBalance recomputes from leave_requests
  // rather than maintaining a redundant balance column.
  sickPayTier?: SickPayTier
}

export interface LeaveService {
  // Art. 109: 21 days/year, rising to 30 days/year once the employee has
  // completed 5 years of continuous service as of the given year's end.
  // Computed from employees.hireDate on every call, not stored — a later
  // year automatically gets the higher entitlement once tenure crosses 5
  // years, with no migration/backfill needed.
  getAnnualLeaveBalance(tenantId: string, employeeId: string, year: number): Promise<AnnualLeaveBalance>

  // Inserts a 'pending' leave_requests row. For leaveType='annual', rejects
  // if the requested days would exceed the remaining annual balance for
  // that year. For leaveType='sick', computes (but does not persist) the
  // art. 117 pay tier from prior approved sick days in the same year.
  createLeaveRequest(input: CreateLeaveRequestInput): Promise<LeaveRequest>

  approveLeaveRequest(tenantId: string, leaveRequestId: string): Promise<LeaveRequest>
  rejectLeaveRequest(tenantId: string, leaveRequestId: string): Promise<LeaveRequest>
}

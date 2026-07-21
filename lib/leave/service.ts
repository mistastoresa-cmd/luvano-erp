import { eq, and, gte, lte, sql } from 'drizzle-orm'
import { leaveRequests, employees } from '@/db/schema'
import type { Db } from '@/db/client'
import type {
  LeaveService,
  AnnualLeaveBalance,
  CreateLeaveRequestInput,
  LeaveRequest,
  LeaveType,
  LeaveRequestStatus,
  SickPayTier,
} from './types'

function dayCount(startDate: string, endDate: string): number {
  const ms = Date.parse(endDate) - Date.parse(startDate)
  return Math.round(ms / 86_400_000) + 1
}

// Full years of continuous service as of a given date — art. 109's "5 years
// of continuous service" test. Whole calendar years only (no month/day
// proration of the entitlement itself, only of the tenure count).
function fullYearsOfService(hireDate: string, asOfDate: Date): number {
  const hire = new Date(hireDate)
  let years = asOfDate.getUTCFullYear() - hire.getUTCFullYear()
  const hireMonthDay = hire.getUTCMonth() * 100 + hire.getUTCDate()
  const asOfMonthDay = asOfDate.getUTCMonth() * 100 + asOfDate.getUTCDate()
  if (asOfMonthDay < hireMonthDay) years -= 1
  return years
}

// Art. 109: 21 days/year, rising to 30 days/year once 5 years of continuous
// service are completed.
function annualLeaveEntitlementDays(hireDate: string, asOfDate: Date): number {
  return fullYearsOfService(hireDate, asOfDate) >= 5 ? 30 : 21
}

function toLeaveRequest(
  row: typeof leaveRequests.$inferSelect,
  sickPayTier?: SickPayTier
): LeaveRequest {
  return {
    id: row.id,
    tenantId: row.tenantId,
    employeeId: row.employeeId,
    leaveType: row.leaveType as LeaveType,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status as LeaveRequestStatus,
    reason: row.reason,
    dayCount: dayCount(row.startDate, row.endDate),
    sickPayTier,
  }
}

export function createLeaveService(db: Db): LeaveService {
  async function getAnnualLeaveBalance(
    tenantId: string,
    employeeId: string,
    year: number
  ): Promise<AnnualLeaveBalance> {
    const [employee] = await db
      .select({ hireDate: employees.hireDate })
      .from(employees)
      .where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId)))
      .limit(1)
    if (!employee) throw new Error(`employee ${employeeId} not found for tenant`)

    const entitlementDays = annualLeaveEntitlementDays(employee.hireDate, new Date(Date.UTC(year, 11, 31)))

    const approvedAnnual = await db
      .select({ startDate: leaveRequests.startDate, endDate: leaveRequests.endDate })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.tenantId, tenantId),
          eq(leaveRequests.employeeId, employeeId),
          eq(leaveRequests.leaveType, 'annual'),
          eq(leaveRequests.status, 'approved'),
          gte(leaveRequests.startDate, `${year}-01-01`),
          lte(leaveRequests.startDate, `${year}-12-31`)
        )
      )
    const usedDays = approvedAnnual.reduce((sum, r) => sum + dayCount(r.startDate, r.endDate), 0)

    return { year, entitlementDays, usedDays, remainingDays: entitlementDays - usedDays }
  }

  return {
    getAnnualLeaveBalance,

    async createLeaveRequest(input: CreateLeaveRequestInput): Promise<LeaveRequest> {
      const requestedDays = dayCount(input.startDate, input.endDate)
      const year = new Date(input.startDate).getUTCFullYear()

      let sickPayTier: SickPayTier | undefined

      if (input.leaveType === 'annual') {
        const balance = await getAnnualLeaveBalance(input.tenantId, input.employeeId, year)
        if (requestedDays > balance.remainingDays) {
          throw new Error(
            `annual leave request (${requestedDays} days) exceeds remaining balance (${balance.remainingDays} days) for ${year}`
          )
        }
      }

      if (input.leaveType === 'sick') {
        // Art. 117: first 30 days/year full pay, next 60 days 3/4 pay, final
        // 30 days unpaid. Tier is picked from the employee's already-approved
        // sick days earlier in the same year — a request straddling a tier
        // boundary gets the tier its first day falls in, not a per-day split
        // (documented simplification, see docs/ARCHITECTURE.md).
        const [priorSum] = await db
          .select({ total: sql<string>`coalesce(sum(${leaveRequests.endDate} - ${leaveRequests.startDate} + 1), 0)` })
          .from(leaveRequests)
          .where(
            and(
              eq(leaveRequests.tenantId, input.tenantId),
              eq(leaveRequests.employeeId, input.employeeId),
              eq(leaveRequests.leaveType, 'sick'),
              eq(leaveRequests.status, 'approved'),
              gte(leaveRequests.startDate, `${year}-01-01`),
              lte(leaveRequests.startDate, `${year}-12-31`)
            )
          )
        const priorDays = Number(priorSum?.total ?? 0)
        sickPayTier = priorDays < 30 ? 'full' : priorDays < 90 ? 'three_quarters' : 'unpaid'
      }

      const [row] = await db
        .insert(leaveRequests)
        .values({
          tenantId: input.tenantId,
          employeeId: input.employeeId,
          leaveType: input.leaveType,
          startDate: input.startDate,
          endDate: input.endDate,
          reason: input.reason,
        })
        .returning()

      return toLeaveRequest(row, sickPayTier)
    },

    async approveLeaveRequest(tenantId: string, leaveRequestId: string): Promise<LeaveRequest> {
      const [row] = await db
        .update(leaveRequests)
        .set({ status: 'approved' })
        .where(
          and(
            eq(leaveRequests.tenantId, tenantId),
            eq(leaveRequests.id, leaveRequestId),
            eq(leaveRequests.status, 'pending')
          )
        )
        .returning()
      if (!row) throw new Error(`leave_request ${leaveRequestId} not found or not pending`)
      return toLeaveRequest(row)
    },

    async rejectLeaveRequest(tenantId: string, leaveRequestId: string): Promise<LeaveRequest> {
      const [row] = await db
        .update(leaveRequests)
        .set({ status: 'rejected' })
        .where(
          and(
            eq(leaveRequests.tenantId, tenantId),
            eq(leaveRequests.id, leaveRequestId),
            eq(leaveRequests.status, 'pending')
          )
        )
        .returning()
      if (!row) throw new Error(`leave_request ${leaveRequestId} not found or not pending`)
      return toLeaveRequest(row)
    },
  }
}

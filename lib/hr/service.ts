import { eq, and, sum } from 'drizzle-orm'
import { payrollRuns, payrollEntries, employees } from '@/db/schema'
import type { Db } from '@/db/client'
import { postJournalEntryInTx } from '../accounting/service'
import { assertRoleAudited } from '../authz/service'
import type { CallerContext } from '../authz/types'
import type {
  HrService,
  CreatePayrollRunInput,
  PayrollRun,
  EmployeePayrollAdjustment,
  ProcessPayrollRunResult,
  PostPayrollJournalResult,
} from './types'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const PAYROLL_ROLES = ['owner', 'accountant'] as const

export function createHrService(db: Db): HrService {
  return {
    async createPayrollRun(context: CallerContext, input: CreatePayrollRunInput): Promise<PayrollRun> {
      assertRoleAudited(db, input.tenantId, context, [...PAYROLL_ROLES])
      const [run] = await db
        .insert(payrollRuns)
        .values({
          tenantId: input.tenantId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
        })
        .returning()
      return run
    },

    async processPayrollRun(
      context: CallerContext,
      tenantId: string,
      payrollRunId: string,
      adjustments: EmployeePayrollAdjustment[] = []
    ): Promise<ProcessPayrollRunResult> {
      assertRoleAudited(db, tenantId, context, [...PAYROLL_ROLES])
      return db.transaction(async (tx) => {
        const [run] = await tx
          .select()
          .from(payrollRuns)
          .where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.tenantId, tenantId)))
          .limit(1)
        if (!run) throw new Error(`payroll_run ${payrollRunId} not found for tenant`)
        if (run.status !== 'draft') {
          throw new Error(`payroll_run ${payrollRunId} already ${run.status}, cannot reprocess`)
        }

        const activeEmployees = await tx
          .select()
          .from(employees)
          .where(and(eq(employees.tenantId, tenantId), eq(employees.status, 'active')))

        const adjustmentByEmployee = new Map(adjustments.map((a) => [a.employeeId, a]))

        const entries = []
        for (const employee of activeEmployees) {
          const adjustment = adjustmentByEmployee.get(employee.id)
          const baseSalary = Number(employee.baseSalary)
          const allowances = round2(adjustment?.allowances ?? 0)
          const deductions = round2(adjustment?.deductions ?? 0)
          const netPay = round2(baseSalary + allowances - deductions)

          const [entry] = await tx
            .insert(payrollEntries)
            .values({
              payrollRunId,
              employeeId: employee.id,
              baseSalary: baseSalary.toFixed(2),
              allowances: allowances.toFixed(2),
              deductions: deductions.toFixed(2),
              netPay: netPay.toFixed(2),
            })
            .returning()

          entries.push({
            id: entry.id,
            employeeId: entry.employeeId,
            baseSalary: Number(entry.baseSalary),
            allowances: Number(entry.allowances),
            deductions: Number(entry.deductions),
            netPay: Number(entry.netPay),
          })
        }

        await tx
          .update(payrollRuns)
          .set({ status: 'processed', processedAt: new Date() })
          .where(eq(payrollRuns.id, payrollRunId))

        return { payrollRunId, entries }
      })
    },

    async postPayrollJournal(
      context: CallerContext,
      tenantId: string,
      payrollRunId: string
    ): Promise<PostPayrollJournalResult> {
      assertRoleAudited(db, tenantId, context, [...PAYROLL_ROLES])
      return db.transaction(async (tx) => {
        const [run] = await tx
          .select()
          .from(payrollRuns)
          .where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.tenantId, tenantId)))
          .limit(1)
        if (!run) throw new Error(`payroll_run ${payrollRunId} not found for tenant`)

        const [totals] = await tx
          .select({ totalNetPay: sum(payrollEntries.netPay) })
          .from(payrollEntries)
          .where(eq(payrollEntries.payrollRunId, payrollRunId))
        const totalNetPay = Number(totals?.totalNetPay ?? 0)
        if (totalNetPay <= 0) {
          throw new Error(`payroll_run ${payrollRunId} has no entries to post — run processPayrollRun first`)
        }

        const result = await postJournalEntryInTx(tx, {
          tenantId,
          entryDate: new Date(run.periodEnd),
          sourceType: 'payroll',
          sourceReference: run.id,
          description: `Payroll run ${run.periodStart} → ${run.periodEnd}`,
          lines: [
            { accountKey: 'salary_expense', debit: totalNetPay },
            { accountKey: 'salary_payable', credit: totalNetPay },
          ],
        })

        await tx
          .update(payrollEntries)
          .set({ journalEntryId: result.journalEntryId })
          .where(eq(payrollEntries.payrollRunId, payrollRunId))

        return { status: result.status, journalEntryId: result.journalEntryId, totalNetPay }
      })
    },
  }
}

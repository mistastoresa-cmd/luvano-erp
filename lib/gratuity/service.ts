import { eq, and } from 'drizzle-orm'
import { employees, gratuityPayments } from '@/db/schema'
import type { Db, DbOrTx } from '@/db/client'
import { postJournalEntryInTx } from '../accounting/service'
import type {
  GratuityService,
  GratuityCalculation,
  TerminateEmployeeInput,
  TerminateEmployeeResult,
  TerminationReason,
} from './types'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function yearsOfServiceBetween(hireDate: string, terminationDate: string): number {
  const days = (Date.parse(terminationDate) - Date.parse(hireDate)) / 86_400_000
  return round2(days / 365.25)
}

// Art. 84: half-month wage per year for the first 5 years, a full month's
// wage per year beyond that.
function grossGratuity(baseSalary: number, yearsOfService: number): number {
  const first5 = Math.min(yearsOfService, 5)
  const beyond5 = Math.max(yearsOfService - 5, 0)
  return round2(first5 * 0.5 * baseSalary + beyond5 * baseSalary)
}

// Art. 85: resignation reduces the gratuity by tenure; any other
// termination reason (employer termination, fixed-term contract ending,
// other) always gets the full unreduced amount.
function applicablePercent(reason: TerminationReason, yearsOfService: number): number {
  if (reason !== 'resignation') return 100
  if (yearsOfService < 2) return 0
  if (yearsOfService < 5) return round2(100 / 3)
  if (yearsOfService < 10) return round2(200 / 3)
  return 100
}

function calculate(baseSalary: number, hireDate: string, terminationDate: string, reason: TerminationReason): GratuityCalculation {
  const yearsOfService = yearsOfServiceBetween(hireDate, terminationDate)
  const gross = grossGratuity(baseSalary, yearsOfService)
  const percent = applicablePercent(reason, yearsOfService)
  return {
    yearsOfService,
    baseSalary,
    applicablePercent: percent,
    grossAmount: gross,
    netAmount: round2(gross * (percent / 100)),
  }
}

async function fetchActiveEmployee(db: DbOrTx, tenantId: string, employeeId: string) {
  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId)))
    .limit(1)
  if (!employee) throw new Error(`employee ${employeeId} not found for tenant`)
  return employee
}

export function createGratuityService(db: Db): GratuityService {
  return {
    async previewEndOfServiceGratuity(
      tenantId: string,
      employeeId: string,
      terminationDate: string,
      terminationReason: TerminationReason
    ): Promise<GratuityCalculation> {
      const employee = await fetchActiveEmployee(db, tenantId, employeeId)
      return calculate(Number(employee.baseSalary), employee.hireDate, terminationDate, terminationReason)
    },

    async terminateEmployee(input: TerminateEmployeeInput): Promise<TerminateEmployeeResult> {
      return db.transaction(async (tx) => {
        const employee = await fetchActiveEmployee(tx, input.tenantId, input.employeeId)
        if (employee.status === 'terminated') {
          throw new Error(`employee ${input.employeeId} is already terminated`)
        }

        const calculation = calculate(
          Number(employee.baseSalary),
          employee.hireDate,
          input.terminationDate,
          input.terminationReason
        )

        const [payment] = await tx
          .insert(gratuityPayments)
          .values({
            tenantId: input.tenantId,
            employeeId: input.employeeId,
            terminationDate: input.terminationDate,
            terminationReason: input.terminationReason,
            yearsOfService: calculation.yearsOfService.toFixed(2),
            baseSalaryAtTermination: calculation.baseSalary.toFixed(2),
            applicablePercent: calculation.applicablePercent.toFixed(2),
            grossAmount: calculation.grossAmount.toFixed(2),
            netAmount: calculation.netAmount.toFixed(2),
          })
          .returning()

        await tx
          .update(employees)
          .set({
            status: 'terminated',
            terminatedAt: input.terminationDate,
            terminationReason: input.terminationReason,
          })
          .where(eq(employees.id, input.employeeId))

        let journalEntryId: string | null = null
        if (calculation.netAmount > 0) {
          const result = await postJournalEntryInTx(tx, {
            tenantId: input.tenantId,
            entryDate: new Date(input.terminationDate),
            sourceType: 'gratuity',
            sourceReference: payment.id,
            description: `End-of-service gratuity for employee ${input.employeeId}`,
            lines: [
              { accountKey: 'gratuity_expense', debit: calculation.netAmount },
              { accountKey: 'gratuity_payable', credit: calculation.netAmount },
            ],
          })
          journalEntryId = result.journalEntryId
          await tx
            .update(gratuityPayments)
            .set({ journalEntryId })
            .where(eq(gratuityPayments.id, payment.id))
        }

        return { ...calculation, gratuityPaymentId: payment.id, journalEntryId }
      })
    },
  }
}

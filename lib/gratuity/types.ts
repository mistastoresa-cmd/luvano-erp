import type { CallerContext } from '../authz/types'

export type TerminationReason = 'resignation' | 'employer_termination' | 'contract_end' | 'other'

export interface GratuityCalculation {
  yearsOfService: number
  baseSalary: number
  applicablePercent: number
  grossAmount: number
  netAmount: number
}

export interface TerminateEmployeeInput {
  tenantId: string
  employeeId: string
  terminationDate: string
  terminationReason: TerminationReason
}

export interface TerminateEmployeeResult extends GratuityCalculation {
  gratuityPaymentId: string
  journalEntryId: string | null
}

// Gratuity is confidential financial + termination data — owner/accountant
// only, same restriction as lib/hr (payroll); excludes branch_manager
// unlike the rest of the HR services (employees, leave, tasks).
export interface GratuityService {
  // Pure calculation, no writes — art. 84 formula (half-month salary/year for
  // the first 5 years, full month/year beyond that) reduced per art. 85 when
  // terminationReason is 'resignation' (0% under 2 years, 1/3 at 2-5 years,
  // 2/3 at 5-10 years, full 10+ years). Any other reason (employer
  // termination, fixed-term contract ending, other) always gets the full
  // unreduced amount.
  previewEndOfServiceGratuity(
    context: CallerContext,
    tenantId: string,
    employeeId: string,
    terminationDate: string,
    terminationReason: TerminationReason
  ): Promise<GratuityCalculation>

  // Writes the gratuity_payments row, marks the employee 'terminated', and
  // (if the net amount is > 0) posts a balanced debit-gratuity_expense/
  // credit-gratuity_payable journal entry via the same postJournalEntryInTx
  // helper postPayrollJournal uses. Throws if the employee is already
  // terminated — this is the idempotency guard (mirrors
  // processPayrollRun's "already processed" check), not a re-postable action.
  terminateEmployee(context: CallerContext, input: TerminateEmployeeInput): Promise<TerminateEmployeeResult>
}

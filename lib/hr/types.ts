export interface CreatePayrollRunInput {
  tenantId: string
  periodStart: string
  periodEnd: string
}

export interface PayrollRun {
  id: string
  tenantId: string
  periodStart: string
  periodEnd: string
  status: 'draft' | 'processed' | 'paid'
  processedAt: Date | null
  createdAt: Date
}

export interface EmployeePayrollAdjustment {
  employeeId: string
  allowances?: number
  deductions?: number
}

export interface PayrollEntryResult {
  id: string
  employeeId: string
  baseSalary: number
  allowances: number
  deductions: number
  netPay: number
}

export interface ProcessPayrollRunResult {
  payrollRunId: string
  entries: PayrollEntryResult[]
}

export interface PostPayrollJournalResult {
  status: 'accepted' | 'duplicate'
  journalEntryId: string
  totalNetPay: number
}

export interface HrService {
  createPayrollRun(input: CreatePayrollRunInput): Promise<PayrollRun>

  // Snapshots each active employee's current baseSalary (+ any per-employee
  // allowances/deductions override) into payroll_entries, computes netPay,
  // and marks the run 'processed'. Snapshotting means a later change to
  // employees.baseSalary never retroactively changes an already-processed
  // run's figures.
  processPayrollRun(
    tenantId: string,
    payrollRunId: string,
    adjustments?: EmployeePayrollAdjustment[]
  ): Promise<ProcessPayrollRunResult>

  // Debit salary_expense, credit salary_payable for sum(netPay) across the
  // run's entries — one balanced journal entry per run, not one per
  // employee, since that's how a real payroll batch reads on the books.
  postPayrollJournal(tenantId: string, payrollRunId: string): Promise<PostPayrollJournalResult>
}

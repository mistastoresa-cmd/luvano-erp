import type { CallerContext } from '../authz/types'
import type { PaymentMethod } from '@/db/schema'

export interface CreateExpenseInput {
  tenantId: string
  branchId?: string
  expenseNumber: string
  expenseDate: string
  expenseAccountId: string
  amount: number
  taxAmount?: number
  description?: string
  paymentMethod: PaymentMethod
  bankAccountId?: string
  chequeNumber?: string
  chequeDueDate?: string
  supplierId?: string
  beneficiary?: string
}

export interface CreateExpenseResult {
  expenseId: string
  expenseNumber: string
}

export interface PostExpenseResult {
  status: 'accepted' | 'duplicate'
  journalEntryId: string
}

export interface ExpensesService {
  // Records the expense document. Does NOT touch the ledger — posting is a
  // separate, explicit step (same "before/after posting" split as sale and
  // supplier invoices).
  createExpense(context: CallerContext, input: CreateExpenseInput): Promise<CreateExpenseResult>

  // Posts the expense to the GL:
  //   debit  expense account (+ debit input_tax when tax is present)
  //   credit cash | the bank account's chart account | accounts_payable
  // depending on paymentMethod. Idempotent per expense.
  postExpenseJournal(
    context: CallerContext,
    tenantId: string,
    expenseId: string
  ): Promise<PostExpenseResult>
}

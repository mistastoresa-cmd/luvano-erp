import { eq, and } from 'drizzle-orm'
import { expenses, bankAccounts } from '@/db/schema'
import type { Db } from '@/db/client'
import { postJournalEntryInTx } from '../accounting/service'
import { assertRoleAudited, assertBranchAccessAudited } from '../authz/service'
import type { CallerContext } from '../authz/types'
import type { JournalLineInput } from '../accounting/types'
import type {
  ExpensesService,
  CreateExpenseInput,
  CreateExpenseResult,
  PostExpenseResult,
} from './types'

// Recording an expense is routine branch/office work; posting it to the GL
// is an accounting decision — same split the rest of the codebase uses.
const RECORD_ROLES = ['owner', 'accountant', 'branch_manager'] as const
const POSTING_ROLES = ['owner', 'accountant'] as const

export function createExpensesService(db: Db): ExpensesService {
  return {
    async createExpense(
      context: CallerContext,
      input: CreateExpenseInput
    ): Promise<CreateExpenseResult> {
      assertRoleAudited(db, input.tenantId, context, [...RECORD_ROLES])
      if (input.branchId) assertBranchAccessAudited(db, input.tenantId, context, input.branchId)

      if (input.amount <= 0) throw new Error('expense amount must be positive')
      // Bank and cheque payments must name the bank they leave from —
      // otherwise there's no account to credit.
      if ((input.paymentMethod === 'bank' || input.paymentMethod === 'cheque') && !input.bankAccountId) {
        throw new Error(`paymentMethod "${input.paymentMethod}" requires a bankAccountId`)
      }

      const [row] = await db
        .insert(expenses)
        .values({
          tenantId: input.tenantId,
          branchId: input.branchId,
          expenseNumber: input.expenseNumber,
          expenseDate: input.expenseDate,
          expenseAccountId: input.expenseAccountId,
          description: input.description,
          amount: input.amount.toFixed(2),
          taxAmount: (input.taxAmount ?? 0).toFixed(2),
          paymentMethod: input.paymentMethod,
          bankAccountId: input.bankAccountId,
          chequeNumber: input.chequeNumber,
          chequeDueDate: input.chequeDueDate,
          supplierId: input.supplierId,
          beneficiary: input.beneficiary,
        })
        .returning({ id: expenses.id, expenseNumber: expenses.expenseNumber })

      return { expenseId: row.id, expenseNumber: row.expenseNumber }
    },

    async postExpenseJournal(
      context: CallerContext,
      tenantId: string,
      expenseId: string
    ): Promise<PostExpenseResult> {
      assertRoleAudited(db, tenantId, context, [...POSTING_ROLES])

      return db.transaction(async (tx) => {
        const [expense] = await tx
          .select()
          .from(expenses)
          .where(and(eq(expenses.id, expenseId), eq(expenses.tenantId, tenantId)))
          .limit(1)
        if (!expense) throw new Error(`expense ${expenseId} not found for tenant`)
        if (expense.branchId) assertBranchAccessAudited(db, tenantId, context, expense.branchId)

        const amount = Number(expense.amount)
        const tax = Number(expense.taxAmount)
        const total = amount + tax

        // Debit: the expense account, plus recoverable input VAT if any.
        const lines: JournalLineInput[] = [
          { accountId: expense.expenseAccountId, debit: amount, description: expense.description ?? undefined },
        ]
        if (tax > 0) lines.push({ accountKey: 'input_tax', debit: tax })

        // Credit: where the money actually comes from.
        if (expense.paymentMethod === 'cash') {
          lines.push({ accountKey: 'cash', credit: total })
        } else if (expense.paymentMethod === 'credit') {
          // On account — nothing leaves yet, it becomes a payable.
          lines.push({ accountKey: 'accounts_payable', credit: total })
        } else {
          // bank | cheque — credit that specific bank's chart account, so the
          // bank's ledger balance tracks its own movements.
          if (!expense.bankAccountId) {
            throw new Error(`expense ${expenseId} is ${expense.paymentMethod} but has no bankAccountId`)
          }
          const [bank] = await tx
            .select({ chartAccountId: bankAccounts.chartAccountId })
            .from(bankAccounts)
            .where(and(eq(bankAccounts.id, expense.bankAccountId), eq(bankAccounts.tenantId, tenantId)))
            .limit(1)
          if (!bank) throw new Error(`bank_account ${expense.bankAccountId} not found for tenant`)
          lines.push({ accountId: bank.chartAccountId, credit: total })
        }

        const result = await postJournalEntryInTx(tx, {
          tenantId,
          branchId: expense.branchId ?? undefined,
          entryDate: new Date(expense.expenseDate),
          sourceType: 'adjustment',
          sourceReference: `expense:${expense.id}`,
          description: expense.description ?? `مصروف ${expense.expenseNumber}`,
          lines,
        })

        await tx
          .update(expenses)
          .set({ journalEntryId: result.journalEntryId, status: 'posted' })
          .where(eq(expenses.id, expenseId))

        return result
      })
    },
  }
}

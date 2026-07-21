import { eq, and, gte, lte, sql } from 'drizzle-orm'
import { journalEntries, journalEntryLines, chartOfAccounts } from '@/db/schema'
import type { Db } from '@/db/client'
import { assertRoleAudited, assertBranchAccessAudited } from '../authz/service'
import type { CallerContext } from '../authz/types'
import type {
  ReportingService,
  BranchProfitAndLoss,
  BranchBalanceSheet,
  CompanyProfitAndLoss,
  CompanyBalanceSheet,
  AccountLineAmount,
} from './types'

interface AccountAggregateRow {
  accountId: string
  accountCode: string
  accountName: string
  accountType: string
  debitSum: string
  creditSum: string
}

// Shared by every report below — one aggregate query per (tenant, branch?,
// entryDate window), grouped by account. branchId omitted (undefined) means
// company-wide: every branch of the tenant in one aggregate, not a sum of
// per-branch results computed separately. Callers turn debit/credit sums
// into a signed amount per account depending on that account's normal
// balance side (revenue/liability/equity increase with credit; asset/expense
// increase with debit).
async function aggregateByAccount(
  db: Db,
  tenantId: string,
  branchId: string | undefined,
  entryDateFrom: Date | null,
  entryDateTo: Date
): Promise<AccountAggregateRow[]> {
  const conditions = [
    eq(journalEntries.tenantId, tenantId),
    eq(journalEntries.status, 'posted'),
    lte(journalEntries.entryDate, entryDateTo),
  ]
  if (branchId) conditions.push(eq(journalEntries.branchId, branchId))
  if (entryDateFrom) conditions.push(gte(journalEntries.entryDate, entryDateFrom))

  return db
    .select({
      accountId: chartOfAccounts.id,
      accountCode: chartOfAccounts.code,
      accountName: chartOfAccounts.name,
      accountType: chartOfAccounts.type,
      debitSum: sql<string>`coalesce(sum(${journalEntryLines.debit}), 0)`,
      creditSum: sql<string>`coalesce(sum(${journalEntryLines.credit}), 0)`,
    })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
    .innerJoin(chartOfAccounts, eq(journalEntryLines.accountId, chartOfAccounts.id))
    .where(and(...conditions))
    .groupBy(chartOfAccounts.id, chartOfAccounts.code, chartOfAccounts.name, chartOfAccounts.type)
}

function toLine(row: AccountAggregateRow, side: 'debit' | 'credit'): AccountLineAmount {
  const debit = Number(row.debitSum)
  const credit = Number(row.creditSum)
  return {
    accountId: row.accountId,
    accountCode: row.accountCode,
    accountName: row.accountName,
    amount: side === 'debit' ? debit - credit : credit - debit,
  }
}

function sumLines(lines: AccountLineAmount[]): number {
  return Math.round(lines.reduce((acc, l) => acc + l.amount, 0) * 100) / 100
}

// P&L/balance sheet visibility — staff excluded entirely (this is the exact
// example TODOS.md's audit-trail item names: "staff can't see P&L"). Company-
// wide rollups are further restricted below to owner/accountant only.
const BRANCH_REPORT_ROLES = ['owner', 'accountant', 'branch_manager'] as const
const COMPANY_REPORT_ROLES = ['owner', 'accountant'] as const

export function createReportingService(db: Db): ReportingService {
  return {
    async getBranchProfitAndLoss(
      context: CallerContext,
      tenantId: string,
      branchId: string,
      dateFrom: Date,
      dateTo: Date
    ): Promise<BranchProfitAndLoss> {
      assertRoleAudited(db, tenantId, context, [...BRANCH_REPORT_ROLES])
      assertBranchAccessAudited(db, tenantId, context, branchId)
      const rows = await aggregateByAccount(db, tenantId, branchId, dateFrom, dateTo)

      const revenueLines = rows.filter((r) => r.accountType === 'revenue').map((r) => toLine(r, 'credit'))
      const expenseLines = rows.filter((r) => r.accountType === 'expense').map((r) => toLine(r, 'debit'))
      const totalRevenue = sumLines(revenueLines)
      const totalExpense = sumLines(expenseLines)

      return {
        branchId,
        dateFrom,
        dateTo,
        revenueLines,
        expenseLines,
        totalRevenue,
        totalExpense,
        netProfit: Math.round((totalRevenue - totalExpense) * 100) / 100,
      }
    },

    async getBranchBalanceSheet(
      context: CallerContext,
      tenantId: string,
      branchId: string,
      asOfDate: Date
    ): Promise<BranchBalanceSheet> {
      assertRoleAudited(db, tenantId, context, [...BRANCH_REPORT_ROLES])
      assertBranchAccessAudited(db, tenantId, context, branchId)
      const rows = await aggregateByAccount(db, tenantId, branchId, null, asOfDate)

      const assetLines = rows.filter((r) => r.accountType === 'asset').map((r) => toLine(r, 'debit'))
      const liabilityLines = rows
        .filter((r) => r.accountType === 'liability')
        .map((r) => toLine(r, 'credit'))
      const equityLines = rows.filter((r) => r.accountType === 'equity').map((r) => toLine(r, 'credit'))

      return {
        branchId,
        asOfDate,
        assetLines,
        liabilityLines,
        equityLines,
        totalAssets: sumLines(assetLines),
        totalLiabilities: sumLines(liabilityLines),
        totalEquity: sumLines(equityLines),
      }
    },

    async getCompanyProfitAndLoss(
      context: CallerContext,
      tenantId: string,
      dateFrom: Date,
      dateTo: Date
    ): Promise<CompanyProfitAndLoss> {
      assertRoleAudited(db, tenantId, context, [...COMPANY_REPORT_ROLES])
      const rows = await aggregateByAccount(db, tenantId, undefined, dateFrom, dateTo)

      const revenueLines = rows.filter((r) => r.accountType === 'revenue').map((r) => toLine(r, 'credit'))
      const expenseLines = rows.filter((r) => r.accountType === 'expense').map((r) => toLine(r, 'debit'))
      const totalRevenue = sumLines(revenueLines)
      const totalExpense = sumLines(expenseLines)

      return {
        dateFrom,
        dateTo,
        revenueLines,
        expenseLines,
        totalRevenue,
        totalExpense,
        netProfit: Math.round((totalRevenue - totalExpense) * 100) / 100,
      }
    },

    async getCompanyBalanceSheet(
      context: CallerContext,
      tenantId: string,
      asOfDate: Date
    ): Promise<CompanyBalanceSheet> {
      assertRoleAudited(db, tenantId, context, [...COMPANY_REPORT_ROLES])
      const rows = await aggregateByAccount(db, tenantId, undefined, null, asOfDate)

      const assetLines = rows.filter((r) => r.accountType === 'asset').map((r) => toLine(r, 'debit'))
      const liabilityLines = rows
        .filter((r) => r.accountType === 'liability')
        .map((r) => toLine(r, 'credit'))
      const equityLines = rows.filter((r) => r.accountType === 'equity').map((r) => toLine(r, 'credit'))

      return {
        asOfDate,
        assetLines,
        liabilityLines,
        equityLines,
        totalAssets: sumLines(assetLines),
        totalLiabilities: sumLines(liabilityLines),
        totalEquity: sumLines(equityLines),
      }
    },
  }
}

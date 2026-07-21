export interface AccountLineAmount {
  accountId: string
  accountCode: string
  accountName: string
  amount: number
}

export interface BranchProfitAndLoss {
  branchId: string
  dateFrom: Date
  dateTo: Date
  revenueLines: AccountLineAmount[]
  expenseLines: AccountLineAmount[]
  totalRevenue: number
  totalExpense: number
  netProfit: number
}

export interface BranchBalanceSheet {
  branchId: string
  asOfDate: Date
  assetLines: AccountLineAmount[]
  liabilityLines: AccountLineAmount[]
  equityLines: AccountLineAmount[]
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
}

export interface ReportingService {
  // Revenue/expense (incl. COGS) for one branch over a date range, aggregated
  // from posted journal_entry_lines via journal_entries.branchId. This is a
  // management/analytic report, not a legally separate per-branch P&L — see
  // docs/ARCHITECTURE.md.
  getBranchProfitAndLoss(
    tenantId: string,
    branchId: string,
    dateFrom: Date,
    dateTo: Date
  ): Promise<BranchProfitAndLoss>

  // Asset/liability/equity balances for one branch as of a date, aggregated
  // the same way. Same caveat: a branch doesn't have a legally separate
  // balance sheet — this filters the company's ledger by the branch
  // dimension for internal decision-making, the standard multi-branch retail
  // ERP approach (Odoo calls this "Analytic Accounting").
  getBranchBalanceSheet(
    tenantId: string,
    branchId: string,
    asOfDate: Date
  ): Promise<BranchBalanceSheet>
}

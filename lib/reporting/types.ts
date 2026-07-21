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

export interface CompanyProfitAndLoss {
  dateFrom: Date
  dateTo: Date
  revenueLines: AccountLineAmount[]
  expenseLines: AccountLineAmount[]
  totalRevenue: number
  totalExpense: number
  netProfit: number
}

export interface CompanyBalanceSheet {
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

  // Same aggregation as getBranchProfitAndLoss but across every branch of
  // the tenant — the "company as a whole" view the founder asked for once
  // every per-branch report was confirmed working (module 6, last of
  // Phase 1.5). Not a sum of the per-branch reports called separately; one
  // aggregate query over the whole tenant's posted lines, so it can't drift
  // from a branch total due to a branch being added/removed mid-period.
  getCompanyProfitAndLoss(tenantId: string, dateFrom: Date, dateTo: Date): Promise<CompanyProfitAndLoss>

  // Company-wide counterpart of getBranchBalanceSheet.
  getCompanyBalanceSheet(tenantId: string, asOfDate: Date): Promise<CompanyBalanceSheet>
}

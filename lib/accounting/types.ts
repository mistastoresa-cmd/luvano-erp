import type { accountMappingKeys } from '@/db/schema'
import type { CallerContext } from '../authz/types'

export type AccountMappingKey = (typeof accountMappingKeys)[number]

export type JournalSourceType =
  | 'manual'
  | 'sale_invoice'
  | 'purchase_invoice'
  | 'supplier_payment'
  | 'payroll'
  | 'gratuity'
  | 'adjustment'
  | 'system'

// A journal line names its account either by a stable mapping *key* (the
// auto-posting paths: sales, purchases, payroll…) or by a concrete
// chart_of_accounts id — needed once users pick a specific account in the UI
// (an expense account, a particular bank account) that has no fixed key.
// Exactly one of the two must be set.
export interface JournalLineInput {
  accountKey?: AccountMappingKey
  accountId?: string
  debit?: number
  credit?: number
  description?: string
}

export interface PostJournalEntryInput {
  tenantId: string
  branchId?: string
  entryDate: Date
  sourceType: JournalSourceType
  // Required whenever this posting should be idempotent against re-runs
  // (every auto-posting path below sets it). Omit only for true one-off
  // manual entries.
  sourceReference?: string
  description?: string
  lines: JournalLineInput[]
}

export interface PostJournalEntryResult {
  status: 'accepted' | 'duplicate'
  journalEntryId: string
}

export interface AccountingService {
  // Generic balanced-entry poster — validates sum(debit) === sum(credit)
  // before writing anything (the invariant the schema comments in
  // db/schema/journal-entries.ts note is an application-layer
  // responsibility). Resolves each line's accountKey via account_mappings.
  // GL posting — owner/accountant only (RBAC T7), not branch_manager/staff.
  postJournalEntry(context: CallerContext, input: PostJournalEntryInput): Promise<PostJournalEntryResult>

  // Debit inventory_asset (+ input_tax if any), credit accounts_payable.
  postSupplierInvoiceJournal(
    context: CallerContext,
    tenantId: string,
    supplierInvoiceId: string
  ): Promise<PostJournalEntryResult>

  // Debit accounts_payable, credit cash. Also recomputes the linked
  // supplier_invoices.status (unpaid/partially_paid/paid) from the sum of its
  // payments.
  postSupplierPaymentJournal(
    context: CallerContext,
    tenantId: string,
    supplierPaymentId: string
  ): Promise<PostJournalEntryResult>

  // Debit cash, credit sales_revenue (+ output_tax_payable if any), plus a
  // debit cogs / credit inventory_asset pair sized from the current weighted-
  // average cost per line (omitted if that comes to 0, e.g. a sale posted
  // before any purchase). Uses the cost as it stands *now*, not frozen at the
  // moment of sale — see docs/ARCHITECTURE.md for that simplification.
  postSaleInvoiceJournal(
    context: CallerContext,
    tenantId: string,
    saleInvoiceId: string
  ): Promise<PostJournalEntryResult>
}

import type { accountMappingKeys } from '@/db/schema'

export type AccountMappingKey = (typeof accountMappingKeys)[number]

export type JournalSourceType =
  | 'manual'
  | 'sale_invoice'
  | 'purchase_invoice'
  | 'supplier_payment'
  | 'adjustment'
  | 'system'

export interface JournalLineInput {
  accountKey: AccountMappingKey
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
  postJournalEntry(input: PostJournalEntryInput): Promise<PostJournalEntryResult>

  // Debit inventory_asset (+ input_tax if any), credit accounts_payable.
  postSupplierInvoiceJournal(
    tenantId: string,
    supplierInvoiceId: string
  ): Promise<PostJournalEntryResult>

  // Debit accounts_payable, credit cash. Also recomputes the linked
  // supplier_invoices.status (unpaid/partially_paid/paid) from the sum of its
  // payments.
  postSupplierPaymentJournal(
    tenantId: string,
    supplierPaymentId: string
  ): Promise<PostJournalEntryResult>

  // Debit cash, credit sales_revenue (+ output_tax_payable if any), plus a
  // debit cogs / credit inventory_asset pair sized from the current weighted-
  // average cost per line (omitted if that comes to 0, e.g. a sale posted
  // before any purchase). Uses the cost as it stands *now*, not frozen at the
  // moment of sale — see docs/ARCHITECTURE.md for that simplification.
  postSaleInvoiceJournal(tenantId: string, saleInvoiceId: string): Promise<PostJournalEntryResult>
}

export interface DocumentFlowLineMovement {
  inventoryMovementId: string
  quantityDelta: number
  occurredAt: Date
}

export interface DocumentFlowLine {
  id: string
  sku: string
  productName: string
  quantity: number
  unitPrice: number
  lineTotal: number
  movement: DocumentFlowLineMovement | null
}

export interface DocumentFlowJournalLine {
  accountId: string
  accountCode: string
  accountName: string
  debit: number
  credit: number
}

export interface DocumentFlowJournalEntry {
  id: string
  entryNumber: string
  entryDate: Date
  status: 'draft' | 'posted' | 'voided'
  lines: DocumentFlowJournalLine[]
}

export interface SaleInvoiceDocumentFlow {
  invoice: {
    id: string
    invoiceNumber: string
    branchId: string
    sourceType: string
    customerName: string | null
    status: string
    subtotal: number
    taxTotal: number
    total: number
    occurredAt: Date
  }
  lines: DocumentFlowLine[]
  journalEntry: DocumentFlowJournalEntry | null
}

export interface DocumentFlowService {
  getSaleInvoiceDocumentFlow(
    context: import('../authz/types').CallerContext,
    tenantId: string,
    saleInvoiceId: string
  ): Promise<SaleInvoiceDocumentFlow>
}

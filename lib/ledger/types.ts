export type MovementReason =
  | 'sale'
  | 'return'
  | 'adjustment'
  | 'transfer_in'
  | 'transfer_out'
  | 'initial_stock'

export type MovementSourceType =
  | 'salla_webhook'
  | 'branch_pos'
  | 'branch_offline_sync'
  | 'manual_adjustment'
  | 'system'

export type InvoiceSourceType = 'salla_order' | 'branch_pos' | 'branch_offline'

export interface RecordInventoryMovementInput {
  tenantId: string
  branchId: string
  sku: string
  quantityDelta: number
  reason: MovementReason
  sourceType: MovementSourceType
  idempotencyKey: string
  occurredAt: Date
  sallaProductId?: string
  sourceReference?: string
  saleInvoiceId?: string
  clientGeneratedId?: string
  createdBy?: string
}

export interface InventoryMovementResult {
  status: 'accepted' | 'duplicate'
  movementId?: string
  resultingQuantity: number
  oversold: boolean
}

export interface SaleInvoiceLineInput {
  sku: string
  productName: string
  quantity: number
  unitPrice: number
  discount?: number
  tax?: number
}

export interface RecordSaleInvoiceInput {
  tenantId: string
  branchId: string
  sourceType: InvoiceSourceType
  idempotencyKey: string
  occurredAt: Date
  invoiceNumber: string
  lines: SaleInvoiceLineInput[]
  sourceReference?: string
  customerName?: string
  customerPhone?: string
  clientGeneratedId?: string
  createdBy?: string
}

export interface SaleInvoiceResult {
  status: 'accepted' | 'duplicate'
  invoiceId?: string
  movements: InventoryMovementResult[]
}

export interface LedgerService {
  recordInventoryMovement(input: RecordInventoryMovementInput): Promise<InventoryMovementResult>
  // Writes invoice + lines + one movement per line, atomically, in one transaction.
  recordSaleInvoice(input: RecordSaleInvoiceInput): Promise<SaleInvoiceResult>
  getInventoryBalance(tenantId: string, branchId: string, sku: string): Promise<number>
}

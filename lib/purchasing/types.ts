import type { CallerContext } from '../authz/types'

export interface PostGoodsReceiptLineResult {
  lineId: string
  status: 'accepted' | 'duplicate'
  movementId: string
  resultingQuantity: number
  oversold: boolean
}

export interface PostGoodsReceiptResult {
  goodsReceiptId: string
  lines: PostGoodsReceiptLineResult[]
}

export interface CreatePurchaseOrderLineInput {
  sku: string
  productName: string
  quantityOrdered: number
  unitCost: number
}

export interface CreatePurchaseOrderInput {
  tenantId: string
  branchId: string
  supplierId: string
  poNumber: string
  orderDate: string
  expectedDate?: string
  notes?: string
  lines: CreatePurchaseOrderLineInput[]
}

export interface CreatePurchaseOrderResult {
  purchaseOrderId: string
}

export type PurchaseOrderStatus = 'draft' | 'sent' | 'partially_received' | 'received' | 'cancelled'

export interface ReceivePurchaseOrderLineInput {
  sku: string
  quantityReceived: number
  unitCost: number
}

export interface ReceivePurchaseOrderInput {
  tenantId: string
  purchaseOrderId: string
  receiptNumber: string
  receivedDate: string
  lines: ReceivePurchaseOrderLineInput[]
}

export interface ReceivePurchaseOrderResult {
  goodsReceiptId: string
  poStatus: PurchaseOrderStatus
  lines: PostGoodsReceiptLineResult[]
}

export interface PurchasingService {
  // Posts every line on an existing goods_receipt as an inventory movement
  // (increase, reason 'purchase_receipt') at the receipt's branch, links each
  // line's inventoryMovementId, and marks the receipt 'completed'. Idempotent —
  // re-posting an already-posted receipt is a safe no-op per line (same
  // idempotency-key pattern as lib/ledger/service.ts). Physical receiving —
  // open to all four roles at the receipt's branch (RBAC T7), unlike
  // creating/sending a PO which is a purchasing-commitment decision.
  postGoodsReceipt(
    context: CallerContext,
    tenantId: string,
    goodsReceiptId: string
  ): Promise<PostGoodsReceiptResult>

  // Creates a purchase_order + purchase_order_lines in 'draft' status.
  // Committing the company to a purchase — owner/accountant/branch_manager
  // only, not staff (RBAC T7).
  createPurchaseOrder(
    context: CallerContext,
    input: CreatePurchaseOrderInput
  ): Promise<CreatePurchaseOrderResult>

  // draft -> sent. Throws if the PO isn't currently 'draft' (a sent/received/
  // cancelled PO can't be "sent" again). Same role restriction as
  // createPurchaseOrder.
  sendPurchaseOrder(context: CallerContext, tenantId: string, purchaseOrderId: string): Promise<void>

  // The PO-lifecycle counterpart of postGoodsReceipt: creates a goods_receipt
  // + goods_receipt_lines against an existing PO (validates every sku is on
  // the PO), posts inventory for it (same logic as postGoodsReceipt, at the
  // PO's branch), and recomputes the PO's status from cumulative received
  // quantity vs ordered quantity per line — 'partially_received' if any line
  // is short, 'received' once every line's cumulative receipts meet or
  // exceed what was ordered. Supports receiving a PO across multiple partial
  // shipments. Physical receiving — same open-to-all-four-roles rule as
  // postGoodsReceipt.
  receivePurchaseOrder(
    context: CallerContext,
    input: ReceivePurchaseOrderInput
  ): Promise<ReceivePurchaseOrderResult>
}

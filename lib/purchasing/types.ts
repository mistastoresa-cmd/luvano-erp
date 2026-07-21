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

export interface PurchasingService {
  // Posts every line on an existing goods_receipt as an inventory movement
  // (increase, reason 'purchase_receipt') at the receipt's branch, links each
  // line's inventoryMovementId, and marks the receipt 'completed'. Idempotent —
  // re-posting an already-posted receipt is a safe no-op per line (same
  // idempotency-key pattern as lib/ledger/service.ts).
  postGoodsReceipt(tenantId: string, goodsReceiptId: string): Promise<PostGoodsReceiptResult>
}

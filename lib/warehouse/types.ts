export interface PostStockTransferLineResult {
  lineId: string
  status: 'accepted' | 'duplicate'
  fromMovementId: string
  toMovementId: string
  fromResultingQuantity: number
  toResultingQuantity: number
  fromOversold: boolean
}

export interface PostStockTransferResult {
  transferId: string
  lines: PostStockTransferLineResult[]
}

export interface WarehouseService {
  // Posts every line on an existing stock_transfer as a paired
  // transfer_out (at fromBranchId) / transfer_in (at toBranchId) inventory
  // movement, links each line's fromMovementId/toMovementId, and marks the
  // transfer 'completed'. Idempotent, same pattern as
  // lib/purchasing/service.ts::postGoodsReceipt. Follows the design spike 1
  // policy: a transfer that would oversell the source branch is still
  // recorded (never blocked) and raises a reconciliation alert instead.
  postStockTransfer(tenantId: string, transferId: string): Promise<PostStockTransferResult>
}

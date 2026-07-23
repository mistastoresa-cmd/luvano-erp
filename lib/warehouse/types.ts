import type { CallerContext } from '../authz/types'

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

export interface TransferPhaseResult {
  transferId: string
  status: 'in_transit' | 'completed' | 'cancelled'
}

export interface WarehouseService {
  // Posts every line on an existing stock_transfer as a paired
  // transfer_out (at fromBranchId) / transfer_in (at toBranchId) inventory
  // movement, links each line's fromMovementId/toMovementId, and marks the
  // transfer 'completed'. Idempotent, same pattern as
  // lib/purchasing/service.ts::postGoodsReceipt. Follows the design spike 1
  // policy: a transfer that would oversell the source branch is still
  // recorded (never blocked) and raises a reconciliation alert instead.
  // Requires branch access to BOTH the source and destination branch (RBAC
  // T7) — a branch_manager restricted to one branch can't move stock into
  // or out of a branch they don't manage.
  postStockTransfer(
    context: CallerContext,
    tenantId: string,
    transferId: string
  ): Promise<PostStockTransferResult>

  // Two-phase (approval) flow for branch-to-branch transfers:
  //
  // initiateStockTransfer — the SENDING branch ships stock: deducts every
  // line from fromBranchId (transfer_out) and moves the transfer to
  // 'in_transit'. The stock has left the source but hasn't landed anywhere
  // yet; it shows as "جاري التحويل" to the receiver. Requires access to the
  // source branch only.
  initiateStockTransfer(
    context: CallerContext,
    tenantId: string,
    transferId: string
  ): Promise<TransferPhaseResult>

  // approveStockTransfer — the RECEIVING branch approves ("تعميد"): adds
  // every line to toBranchId (transfer_in, carrying the source's cost) and
  // marks the transfer 'completed'. Requires access to the destination
  // branch — so a receiver confirms goods actually arrived. Only valid from
  // 'in_transit'.
  approveStockTransfer(
    context: CallerContext,
    tenantId: string,
    transferId: string
  ): Promise<TransferPhaseResult>

  // cancelStockTransfer — returns in-transit stock to the source branch
  // (reverses the transfer_out) and marks the transfer 'cancelled'. Only
  // valid from 'in_transit'; requires access to the source branch.
  cancelStockTransfer(
    context: CallerContext,
    tenantId: string,
    transferId: string
  ): Promise<TransferPhaseResult>
}

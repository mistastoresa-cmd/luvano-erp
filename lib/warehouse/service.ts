import { eq, and } from 'drizzle-orm'
import { stockTransfers, stockTransferLines, inventoryMovements } from '@/db/schema'
import type { Db, Tx } from '@/db/client'
import { applyInventoryDelta, applyInventoryDeltaWithCost, readInventoryCost } from '../ledger/balance'
import { raiseOversellAlert } from '../ledger/alerts'
import { assertRoleAudited, assertBranchAccessAudited } from '../authz/service'
import type { CallerContext } from '../authz/types'
import type {
  WarehouseService,
  PostStockTransferResult,
  PostStockTransferLineResult,
  TransferPhaseResult,
} from './types'

const TRANSFER_ROLES = ['owner', 'accountant', 'branch_manager', 'staff'] as const

async function loadTransfer(db: Db, tenantId: string, transferId: string) {
  const [transfer] = await db
    .select()
    .from(stockTransfers)
    .where(and(eq(stockTransfers.id, transferId), eq(stockTransfers.tenantId, tenantId)))
    .limit(1)
  if (!transfer) throw new Error(`stock_transfer ${transferId} not found for tenant`)
  return transfer
}

async function insertTransferMovement(
  tx: Tx,
  tenantId: string,
  branchId: string,
  sku: string,
  quantityDelta: number,
  reason: 'transfer_out' | 'transfer_in',
  idempotencyKey: string,
  occurredAt: Date,
  transferId: string
) {
  const [row] = await tx
    .insert(inventoryMovements)
    .values({
      tenantId,
      branchId,
      sku,
      quantityDelta,
      reason,
      sourceType: 'stock_transfer',
      sourceReference: transferId,
      idempotencyKey,
      occurredAt,
    })
    .onConflictDoNothing({
      target: [inventoryMovements.tenantId, inventoryMovements.idempotencyKey],
    })
    .returning({ id: inventoryMovements.id })

  if (row) return { movementId: row.id, isNew: true as const }

  const [existing] = await tx
    .select({ id: inventoryMovements.id })
    .from(inventoryMovements)
    .where(
      and(eq(inventoryMovements.tenantId, tenantId), eq(inventoryMovements.idempotencyKey, idempotencyKey))
    )
    .limit(1)
  return { movementId: existing.id, isNew: false as const }
}

export function createWarehouseService(db: Db): WarehouseService {
  return {
    async postStockTransfer(
      context: CallerContext,
      tenantId: string,
      transferId: string
    ): Promise<PostStockTransferResult> {
      assertRoleAudited(db, tenantId, context, [...TRANSFER_ROLES])
      const [transferBranches] = await db
        .select({ fromBranchId: stockTransfers.fromBranchId, toBranchId: stockTransfers.toBranchId })
        .from(stockTransfers)
        .where(and(eq(stockTransfers.id, transferId), eq(stockTransfers.tenantId, tenantId)))
        .limit(1)
      if (!transferBranches) throw new Error(`stock_transfer ${transferId} not found for tenant`)
      assertBranchAccessAudited(db, tenantId, context, transferBranches.fromBranchId)
      assertBranchAccessAudited(db, tenantId, context, transferBranches.toBranchId)

      return db.transaction(async (tx) => {
        const [transfer] = await tx
          .select()
          .from(stockTransfers)
          .where(and(eq(stockTransfers.id, transferId), eq(stockTransfers.tenantId, tenantId)))
          .limit(1)
        if (!transfer) throw new Error(`stock_transfer ${transferId} not found for tenant`)

        const lines = await tx
          .select()
          .from(stockTransferLines)
          .where(eq(stockTransferLines.transferId, transferId))

        const results: PostStockTransferLineResult[] = []
        const occurredAt = new Date(transfer.transferDate)

        for (const line of lines) {
          const outKey = `stock-transfer-line:${line.id}:out`
          const inKey = `stock-transfer-line:${line.id}:in`

          const out = await insertTransferMovement(
            tx,
            tenantId,
            transfer.fromBranchId,
            line.sku,
            -Math.abs(line.quantity),
            'transfer_out',
            outKey,
            occurredAt,
            transferId
          )
          const in_ = await insertTransferMovement(
            tx,
            tenantId,
            transfer.toBranchId,
            line.sku,
            Math.abs(line.quantity),
            'transfer_in',
            inKey,
            occurredAt,
            transferId
          )

          if (!out.isNew && !in_.isNew) {
            results.push({
              lineId: line.id,
              status: 'duplicate',
              fromMovementId: out.movementId,
              toMovementId: in_.movementId,
              fromResultingQuantity: 0,
              toResultingQuantity: 0,
              fromOversold: false,
            })
            continue
          }

          // Read the source branch's average cost before mutating anything —
          // that's the cost basis moving with the stock. A transfer_out never
          // changes average cost itself (only quantity), so read order versus
          // the "out" decrement below doesn't matter for correctness, but
          // reading it upfront keeps the cost-carrying intent explicit.
          const sourceCost = in_.isNew
            ? await readInventoryCost(tx, tenantId, transfer.fromBranchId, line.sku)
            : 0

          const fromBalance = out.isNew
            ? await applyInventoryDelta(
                tx,
                tenantId,
                transfer.fromBranchId,
                line.sku,
                -Math.abs(line.quantity)
              )
            : { resultingQuantity: 0, oversold: false }
          const toBalance = in_.isNew
            ? await applyInventoryDeltaWithCost(
                tx,
                tenantId,
                transfer.toBranchId,
                line.sku,
                Math.abs(line.quantity),
                sourceCost
              )
            : { resultingQuantity: 0, oversold: false, averageCost: 0 }

          await tx
            .update(stockTransferLines)
            .set({ fromMovementId: out.movementId, toMovementId: in_.movementId })
            .where(eq(stockTransferLines.id, line.id))

          if (fromBalance.oversold) {
            await raiseOversellAlert(
              tx,
              tenantId,
              transfer.fromBranchId,
              line.sku,
              fromBalance.resultingQuantity,
              [out.movementId]
            )
          }

          results.push({
            lineId: line.id,
            status: 'accepted',
            fromMovementId: out.movementId,
            toMovementId: in_.movementId,
            fromResultingQuantity: fromBalance.resultingQuantity,
            toResultingQuantity: toBalance.resultingQuantity,
            fromOversold: fromBalance.oversold,
          })
        }

        await tx
          .update(stockTransfers)
          .set({ status: 'completed' })
          .where(eq(stockTransfers.id, transferId))

        return { transferId, lines: results }
      })
    },

    async initiateStockTransfer(context, tenantId, transferId): Promise<TransferPhaseResult> {
      assertRoleAudited(db, tenantId, context, [...TRANSFER_ROLES])
      const transfer = await loadTransfer(db, tenantId, transferId)
      // Shipping is the source branch's action.
      assertBranchAccessAudited(db, tenantId, context, transfer.fromBranchId)
      if (transfer.status !== 'draft') {
        throw new Error(`transfer ${transferId} must be 'draft' to ship (is '${transfer.status}')`)
      }

      return db.transaction(async (tx) => {
        const lines = await tx
          .select()
          .from(stockTransferLines)
          .where(eq(stockTransferLines.transferId, transferId))
        const occurredAt = new Date(transfer.transferDate)

        for (const line of lines) {
          const out = await insertTransferMovement(
            tx,
            tenantId,
            transfer.fromBranchId,
            line.sku,
            -Math.abs(line.quantity),
            'transfer_out',
            `stock-transfer-line:${line.id}:out`,
            occurredAt,
            transferId
          )
          if (out.isNew) {
            const fromBalance = await applyInventoryDelta(
              tx,
              tenantId,
              transfer.fromBranchId,
              line.sku,
              -Math.abs(line.quantity)
            )
            if (fromBalance.oversold) {
              await raiseOversellAlert(
                tx,
                tenantId,
                transfer.fromBranchId,
                line.sku,
                fromBalance.resultingQuantity,
                [out.movementId]
              )
            }
          }
          await tx
            .update(stockTransferLines)
            .set({ fromMovementId: out.movementId })
            .where(eq(stockTransferLines.id, line.id))
        }

        await tx
          .update(stockTransfers)
          .set({ status: 'in_transit' })
          .where(eq(stockTransfers.id, transferId))
        return { transferId, status: 'in_transit' }
      })
    },

    async approveStockTransfer(context, tenantId, transferId): Promise<TransferPhaseResult> {
      assertRoleAudited(db, tenantId, context, [...TRANSFER_ROLES])
      const transfer = await loadTransfer(db, tenantId, transferId)
      // Approval ("تعميد") is the receiving branch's action.
      assertBranchAccessAudited(db, tenantId, context, transfer.toBranchId)
      if (transfer.status !== 'in_transit') {
        throw new Error(`transfer ${transferId} must be 'in_transit' to approve (is '${transfer.status}')`)
      }

      return db.transaction(async (tx) => {
        const lines = await tx
          .select()
          .from(stockTransferLines)
          .where(eq(stockTransferLines.transferId, transferId))
        const occurredAt = new Date()

        for (const line of lines) {
          // The cost basis travels with the goods — read the source branch's
          // average cost at approval time (unchanged by the earlier out).
          const sourceCost = await readInventoryCost(tx, tenantId, transfer.fromBranchId, line.sku)
          const in_ = await insertTransferMovement(
            tx,
            tenantId,
            transfer.toBranchId,
            line.sku,
            Math.abs(line.quantity),
            'transfer_in',
            `stock-transfer-line:${line.id}:in`,
            occurredAt,
            transferId
          )
          if (in_.isNew) {
            await applyInventoryDeltaWithCost(
              tx,
              tenantId,
              transfer.toBranchId,
              line.sku,
              Math.abs(line.quantity),
              sourceCost
            )
          }
          await tx
            .update(stockTransferLines)
            .set({ toMovementId: in_.movementId })
            .where(eq(stockTransferLines.id, line.id))
        }

        await tx
          .update(stockTransfers)
          .set({ status: 'completed' })
          .where(eq(stockTransfers.id, transferId))
        return { transferId, status: 'completed' }
      })
    },

    async cancelStockTransfer(context, tenantId, transferId): Promise<TransferPhaseResult> {
      assertRoleAudited(db, tenantId, context, [...TRANSFER_ROLES])
      const transfer = await loadTransfer(db, tenantId, transferId)
      assertBranchAccessAudited(db, tenantId, context, transfer.fromBranchId)
      if (transfer.status !== 'in_transit') {
        throw new Error(`transfer ${transferId} must be 'in_transit' to cancel (is '${transfer.status}')`)
      }

      return db.transaction(async (tx) => {
        const lines = await tx
          .select()
          .from(stockTransferLines)
          .where(eq(stockTransferLines.transferId, transferId))
        const occurredAt = new Date()

        // Return the in-transit stock to the source branch (reverse the out).
        for (const line of lines) {
          const back = await insertTransferMovement(
            tx,
            tenantId,
            transfer.fromBranchId,
            line.sku,
            Math.abs(line.quantity),
            'transfer_in',
            `stock-transfer-line:${line.id}:cancel`,
            occurredAt,
            transferId
          )
          if (back.isNew) {
            const cost = await readInventoryCost(tx, tenantId, transfer.fromBranchId, line.sku)
            await applyInventoryDeltaWithCost(
              tx,
              tenantId,
              transfer.fromBranchId,
              line.sku,
              Math.abs(line.quantity),
              cost
            )
          }
        }

        await tx
          .update(stockTransfers)
          .set({ status: 'cancelled' })
          .where(eq(stockTransfers.id, transferId))
        return { transferId, status: 'cancelled' }
      })
    },
  }
}

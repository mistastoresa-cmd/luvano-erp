import { eq, and } from 'drizzle-orm'
import { stockTransfers, stockTransferLines, inventoryMovements } from '@/db/schema'
import type { Db, Tx } from '@/db/client'
import { applyInventoryDelta } from '../ledger/balance'
import { raiseOversellAlert } from '../ledger/alerts'
import type { WarehouseService, PostStockTransferResult, PostStockTransferLineResult } from './types'

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
      tenantId: string,
      transferId: string
    ): Promise<PostStockTransferResult> {
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
            ? await applyInventoryDelta(
                tx,
                tenantId,
                transfer.toBranchId,
                line.sku,
                Math.abs(line.quantity)
              )
            : { resultingQuantity: 0, oversold: false }

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
  }
}

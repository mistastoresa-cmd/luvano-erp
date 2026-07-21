import { eq, and } from 'drizzle-orm'
import { goodsReceipts, goodsReceiptLines, inventoryMovements } from '@/db/schema'
import type { Db } from '@/db/client'
import { applyInventoryDeltaWithCost } from '../ledger/balance'
import { raiseOversellAlert } from '../ledger/alerts'
import type { PurchasingService, PostGoodsReceiptResult, PostGoodsReceiptLineResult } from './types'

export function createPurchasingService(db: Db): PurchasingService {
  return {
    async postGoodsReceipt(
      tenantId: string,
      goodsReceiptId: string
    ): Promise<PostGoodsReceiptResult> {
      return db.transaction(async (tx) => {
        const [receipt] = await tx
          .select()
          .from(goodsReceipts)
          .where(and(eq(goodsReceipts.id, goodsReceiptId), eq(goodsReceipts.tenantId, tenantId)))
          .limit(1)
        if (!receipt) throw new Error(`goods_receipt ${goodsReceiptId} not found for tenant`)

        const lines = await tx
          .select()
          .from(goodsReceiptLines)
          .where(eq(goodsReceiptLines.goodsReceiptId, goodsReceiptId))

        const results: PostGoodsReceiptLineResult[] = []

        for (const line of lines) {
          const idempotencyKey = `purchase-receipt-line:${line.id}`

          const [movementRow] = await tx
            .insert(inventoryMovements)
            .values({
              tenantId,
              branchId: receipt.branchId,
              sku: line.sku,
              quantityDelta: line.quantityReceived,
              reason: 'purchase_receipt',
              sourceType: 'purchase_receipt',
              sourceReference: receipt.id,
              idempotencyKey,
              occurredAt: new Date(receipt.receivedDate),
            })
            .onConflictDoNothing({
              target: [inventoryMovements.tenantId, inventoryMovements.idempotencyKey],
            })
            .returning({ id: inventoryMovements.id })

          if (!movementRow) {
            // Already posted (re-run of the same receipt) — look up the
            // existing movement so the line's FK and the response stay
            // correct without re-applying the quantity delta a second time.
            const [existing] = await tx
              .select({ id: inventoryMovements.id })
              .from(inventoryMovements)
              .where(
                and(
                  eq(inventoryMovements.tenantId, tenantId),
                  eq(inventoryMovements.idempotencyKey, idempotencyKey)
                )
              )
              .limit(1)
            results.push({
              lineId: line.id,
              status: 'duplicate',
              movementId: existing.id,
              resultingQuantity: 0,
              oversold: false,
            })
            continue
          }

          const movementId = movementRow.id
          const { resultingQuantity, oversold } = await applyInventoryDeltaWithCost(
            tx,
            tenantId,
            receipt.branchId,
            line.sku,
            line.quantityReceived,
            Number(line.unitCost)
          )

          await tx
            .update(goodsReceiptLines)
            .set({ inventoryMovementId: movementId })
            .where(eq(goodsReceiptLines.id, line.id))

          if (oversold) {
            await raiseOversellAlert(tx, tenantId, receipt.branchId, line.sku, resultingQuantity, [
              movementId,
            ])
          }

          results.push({ lineId: line.id, status: 'accepted', movementId, resultingQuantity, oversold })
        }

        await tx
          .update(goodsReceipts)
          .set({ status: 'completed' })
          .where(eq(goodsReceipts.id, goodsReceiptId))

        return { goodsReceiptId, lines: results }
      })
    },
  }
}

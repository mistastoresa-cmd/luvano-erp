import { eq, and, sql } from 'drizzle-orm'
import {
  goodsReceipts,
  goodsReceiptLines,
  inventoryMovements,
  purchaseOrders,
  purchaseOrderLines,
} from '@/db/schema'
import type { Db, Tx } from '@/db/client'
import { applyInventoryDeltaWithCost } from '../ledger/balance'
import { raiseOversellAlert } from '../ledger/alerts'
import type {
  PurchasingService,
  PostGoodsReceiptResult,
  PostGoodsReceiptLineResult,
  CreatePurchaseOrderInput,
  CreatePurchaseOrderResult,
  ReceivePurchaseOrderInput,
  ReceivePurchaseOrderResult,
  PurchaseOrderStatus,
} from './types'

async function postGoodsReceiptInTx(
  tx: Tx,
  tenantId: string,
  goodsReceiptId: string
): Promise<PostGoodsReceiptResult> {
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

  await tx.update(goodsReceipts).set({ status: 'completed' }).where(eq(goodsReceipts.id, goodsReceiptId))

  return { goodsReceiptId, lines: results }
}

export function createPurchasingService(db: Db): PurchasingService {
  return {
    async postGoodsReceipt(
      tenantId: string,
      goodsReceiptId: string
    ): Promise<PostGoodsReceiptResult> {
      return db.transaction((tx) => postGoodsReceiptInTx(tx, tenantId, goodsReceiptId))
    },

    async createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<CreatePurchaseOrderResult> {
      return db.transaction(async (tx) => {
        const [po] = await tx
          .insert(purchaseOrders)
          .values({
            tenantId: input.tenantId,
            branchId: input.branchId,
            supplierId: input.supplierId,
            poNumber: input.poNumber,
            orderDate: input.orderDate,
            expectedDate: input.expectedDate,
            notes: input.notes,
          })
          .returning()

        for (const line of input.lines) {
          await tx.insert(purchaseOrderLines).values({
            purchaseOrderId: po.id,
            sku: line.sku,
            productName: line.productName,
            quantityOrdered: line.quantityOrdered,
            unitCost: line.unitCost.toFixed(2),
          })
        }

        return { purchaseOrderId: po.id }
      })
    },

    async sendPurchaseOrder(tenantId: string, purchaseOrderId: string): Promise<void> {
      const [po] = await db
        .select()
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.id, purchaseOrderId), eq(purchaseOrders.tenantId, tenantId)))
        .limit(1)
      if (!po) throw new Error(`purchase_order ${purchaseOrderId} not found for tenant`)
      if (po.status !== 'draft') {
        throw new Error(`purchase_order ${purchaseOrderId} is ${po.status}, can only send a draft PO`)
      }

      await db.update(purchaseOrders).set({ status: 'sent' }).where(eq(purchaseOrders.id, purchaseOrderId))
    },

    async receivePurchaseOrder(input: ReceivePurchaseOrderInput): Promise<ReceivePurchaseOrderResult> {
      return db.transaction(async (tx) => {
        const { tenantId, purchaseOrderId } = input

        const [po] = await tx
          .select()
          .from(purchaseOrders)
          .where(and(eq(purchaseOrders.id, purchaseOrderId), eq(purchaseOrders.tenantId, tenantId)))
          .limit(1)
        if (!po) throw new Error(`purchase_order ${purchaseOrderId} not found for tenant`)
        if (po.status === 'received' || po.status === 'cancelled') {
          throw new Error(`purchase_order ${purchaseOrderId} is ${po.status}, cannot receive against it`)
        }

        const poLines = await tx
          .select()
          .from(purchaseOrderLines)
          .where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId))
        const poLinesBySku = new Map(poLines.map((l) => [l.sku, l]))

        for (const line of input.lines) {
          if (!poLinesBySku.has(line.sku)) {
            throw new Error(`sku ${line.sku} is not on purchase_order ${purchaseOrderId}`)
          }
        }

        const [receipt] = await tx
          .insert(goodsReceipts)
          .values({
            tenantId,
            branchId: po.branchId,
            purchaseOrderId,
            receiptNumber: input.receiptNumber,
            receivedDate: input.receivedDate,
          })
          .returning()

        for (const line of input.lines) {
          const poLine = poLinesBySku.get(line.sku)!
          await tx.insert(goodsReceiptLines).values({
            goodsReceiptId: receipt.id,
            purchaseOrderLineId: poLine.id,
            sku: line.sku,
            quantityReceived: line.quantityReceived,
            unitCost: line.unitCost.toFixed(2),
          })
        }

        const postResult = await postGoodsReceiptInTx(tx, tenantId, receipt.id)

        // Recompute PO status from cumulative received quantity vs ordered
        // quantity per line, across every completed receipt linked to this
        // PO (not just this one) — a PO can be received across multiple
        // partial shipments.
        const receivedTotals = await tx
          .select({
            sku: goodsReceiptLines.sku,
            totalReceived: sql<string>`sum(${goodsReceiptLines.quantityReceived})`,
          })
          .from(goodsReceiptLines)
          .innerJoin(goodsReceipts, eq(goodsReceiptLines.goodsReceiptId, goodsReceipts.id))
          .where(
            and(eq(goodsReceipts.purchaseOrderId, purchaseOrderId), eq(goodsReceipts.status, 'completed'))
          )
          .groupBy(goodsReceiptLines.sku)
        const receivedBySku = new Map(receivedTotals.map((r) => [r.sku, Number(r.totalReceived)]))

        const fullyReceived = poLines.every(
          (l) => (receivedBySku.get(l.sku) ?? 0) >= l.quantityOrdered
        )
        const anyReceived = poLines.some((l) => (receivedBySku.get(l.sku) ?? 0) > 0)
        const poStatus: PurchaseOrderStatus = fullyReceived
          ? 'received'
          : anyReceived
            ? 'partially_received'
            : po.status

        await tx.update(purchaseOrders).set({ status: poStatus }).where(eq(purchaseOrders.id, purchaseOrderId))

        return { goodsReceiptId: receipt.id, poStatus, lines: postResult.lines }
      })
    },
  }
}

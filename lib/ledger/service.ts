import { eq, and } from 'drizzle-orm'
import { inventoryMovements, saleInvoices, saleInvoiceLines, reconciliationAlerts } from '@/db/schema'
import type { Db, DbOrTx } from '@/db/client'
import { applyInventoryDelta, readInventoryBalance } from './balance'
import type {
  LedgerService,
  RecordInventoryMovementInput,
  RecordSaleInvoiceInput,
  InventoryMovementResult,
  SaleInvoiceResult,
} from './types'

async function raiseOversellAlert(
  db: DbOrTx,
  tenantId: string,
  branchId: string,
  sku: string,
  resultingQuantity: number,
  movementIds: string[]
) {
  await db.insert(reconciliationAlerts).values({
    tenantId,
    branchId,
    sku,
    type: 'oversell',
    detail: { resultingQuantity, movementIds },
  })
}

export function createLedgerService(db: Db): LedgerService {
  return {
    async recordInventoryMovement(
      input: RecordInventoryMovementInput
    ): Promise<InventoryMovementResult> {
      return db.transaction(async (tx) => {
        // onConflictDoNothing, not try/catch around a plain insert: a unique-
        // violation error inside a Postgres transaction aborts the *whole*
        // transaction (every later statement fails with "current transaction
        // is aborted" until rollback) — so a follow-up SELECT in the catch
        // block would itself fail. onConflictDoNothing never raises the error
        // in the first place, so the transaction stays healthy and the
        // duplicate-lookup SELECT below just works.
        const [row] = await tx
          .insert(inventoryMovements)
          .values({
            tenantId: input.tenantId,
            branchId: input.branchId,
            sku: input.sku,
            sallaProductId: input.sallaProductId,
            quantityDelta: input.quantityDelta,
            reason: input.reason,
            sourceType: input.sourceType,
            sourceReference: input.sourceReference,
            saleInvoiceId: input.saleInvoiceId,
            idempotencyKey: input.idempotencyKey,
            clientGeneratedId: input.clientGeneratedId,
            occurredAt: input.occurredAt,
            createdBy: input.createdBy,
          })
          .onConflictDoNothing({
            target: [inventoryMovements.tenantId, inventoryMovements.idempotencyKey],
          })
          .returning({ id: inventoryMovements.id })

        if (!row) {
          const resultingQuantity = await readInventoryBalance(
            tx,
            input.tenantId,
            input.branchId,
            input.sku
          )
          return { status: 'duplicate', resultingQuantity, oversold: resultingQuantity < 0 }
        }
        const movementId = row.id

        const { resultingQuantity, oversold } = await applyInventoryDelta(
          tx,
          input.tenantId,
          input.branchId,
          input.sku,
          input.quantityDelta
        )

        if (oversold) {
          await raiseOversellAlert(
            tx,
            input.tenantId,
            input.branchId,
            input.sku,
            resultingQuantity,
            [movementId]
          )
        }

        return { status: 'accepted', movementId, resultingQuantity, oversold }
      })
    },

    async recordSaleInvoice(input: RecordSaleInvoiceInput): Promise<SaleInvoiceResult> {
      return db.transaction(async (tx) => {
        const subtotal = input.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
        const discountTotal = input.lines.reduce((sum, l) => sum + (l.discount ?? 0), 0)
        const taxTotal = input.lines.reduce((sum, l) => sum + (l.tax ?? 0), 0)
        const total = subtotal - discountTotal + taxTotal

        const [invoiceRow] = await tx
          .insert(saleInvoices)
          .values({
            tenantId: input.tenantId,
            branchId: input.branchId,
            invoiceNumber: input.invoiceNumber,
            sourceType: input.sourceType,
            sourceReference: input.sourceReference,
            customerId: input.customerId,
            customerName: input.customerName,
            customerPhone: input.customerPhone,
            subtotal: subtotal.toFixed(2),
            discountTotal: discountTotal.toFixed(2),
            taxTotal: taxTotal.toFixed(2),
            total: total.toFixed(2),
            idempotencyKey: input.idempotencyKey,
            clientGeneratedId: input.clientGeneratedId,
            occurredAt: input.occurredAt,
            createdBy: input.createdBy,
          })
          .onConflictDoNothing({
            target: [saleInvoices.tenantId, saleInvoices.idempotencyKey],
          })
          .returning({ id: saleInvoices.id })

        if (!invoiceRow) {
          const [existing] = await tx
            .select({ id: saleInvoices.id })
            .from(saleInvoices)
            .where(
              and(
                eq(saleInvoices.tenantId, input.tenantId),
                eq(saleInvoices.idempotencyKey, input.idempotencyKey)
              )
            )
            .limit(1)
          return { status: 'duplicate', invoiceId: existing?.id, movements: [] }
        }
        const invoiceId = invoiceRow.id

        const movements: InventoryMovementResult[] = []
        for (const [i, line] of input.lines.entries()) {
          const lineTotal = line.unitPrice * line.quantity - (line.discount ?? 0) + (line.tax ?? 0)

          const { resultingQuantity, oversold } = await applyInventoryDelta(
            tx,
            input.tenantId,
            input.branchId,
            line.sku,
            -Math.abs(line.quantity)
          )

          const [movementRow] = await tx
            .insert(inventoryMovements)
            .values({
              tenantId: input.tenantId,
              branchId: input.branchId,
              sku: line.sku,
              quantityDelta: -Math.abs(line.quantity),
              reason: 'sale',
              sourceType:
                input.sourceType === 'salla_order'
                  ? 'salla_webhook'
                  : input.sourceType === 'branch_offline'
                    ? 'branch_offline_sync'
                    : 'branch_pos',
              sourceReference: input.sourceReference,
              saleInvoiceId: invoiceId,
              idempotencyKey: `${input.idempotencyKey}:line:${i}`,
              occurredAt: input.occurredAt,
              createdBy: input.createdBy,
            })
            .returning({ id: inventoryMovements.id })

          await tx.insert(saleInvoiceLines).values({
            invoiceId,
            sku: line.sku,
            productName: line.productName,
            quantity: line.quantity,
            unitPrice: line.unitPrice.toFixed(2),
            discount: (line.discount ?? 0).toFixed(2),
            tax: (line.tax ?? 0).toFixed(2),
            lineTotal: lineTotal.toFixed(2),
            inventoryMovementId: movementRow.id,
          })

          if (oversold) {
            await raiseOversellAlert(
              tx,
              input.tenantId,
              input.branchId,
              line.sku,
              resultingQuantity,
              [movementRow.id]
            )
          }

          movements.push({
            status: 'accepted',
            movementId: movementRow.id,
            resultingQuantity,
            oversold,
          })
        }

        return { status: 'accepted', invoiceId, movements }
      })
    },

    async getInventoryBalance(tenantId: string, branchId: string, sku: string): Promise<number> {
      return readInventoryBalance(db, tenantId, branchId, sku)
    },
  }
}

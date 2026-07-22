import { eq } from 'drizzle-orm'
import {
  saleInvoices,
  saleInvoiceLines,
  inventoryMovements,
  journalEntries,
  journalEntryLines,
  chartOfAccounts,
} from '@/db/schema'
import type { Db } from '@/db/client'
import { assertRoleAudited, assertBranchAccessAudited } from '../authz/service'
import type { CallerContext } from '../authz/types'
import type { DocumentFlowService, SaleInvoiceDocumentFlow, DocumentFlowLine } from './types'

// Every role that can see a sale invoice can see its full document-flow
// trail (invoice -> inventory movement -> journal entry) — this is a read
// of documents the caller is already authorized to see individually
// (sale_invoices via branch access, journal_entries via the same tenant),
// not a separate permission surface.
const DOCUMENT_FLOW_ROLES = ['owner', 'accountant', 'branch_manager', 'staff'] as const

export function createDocumentFlowService(db: Db): DocumentFlowService {
  return {
    async getSaleInvoiceDocumentFlow(
      context: CallerContext,
      tenantId: string,
      saleInvoiceId: string
    ): Promise<SaleInvoiceDocumentFlow> {
      assertRoleAudited(db, tenantId, context, [...DOCUMENT_FLOW_ROLES])

      const [invoice] = await db
        .select()
        .from(saleInvoices)
        .where(eq(saleInvoices.id, saleInvoiceId))
        .limit(1)
      if (!invoice || invoice.tenantId !== tenantId) {
        throw new Error(`sale invoice ${saleInvoiceId} not found for tenant ${tenantId}`)
      }
      assertBranchAccessAudited(db, tenantId, context, invoice.branchId)

      const lineRows = await db
        .select()
        .from(saleInvoiceLines)
        .where(eq(saleInvoiceLines.invoiceId, saleInvoiceId))

      const lines: DocumentFlowLine[] = await Promise.all(
        lineRows.map(async (line) => {
          let movement: DocumentFlowLine['movement'] = null
          if (line.inventoryMovementId) {
            const [movementRow] = await db
              .select()
              .from(inventoryMovements)
              .where(eq(inventoryMovements.id, line.inventoryMovementId))
              .limit(1)
            if (movementRow) {
              movement = {
                inventoryMovementId: movementRow.id,
                quantityDelta: movementRow.quantityDelta,
                occurredAt: movementRow.occurredAt,
              }
            }
          }
          return {
            id: line.id,
            sku: line.sku,
            productName: line.productName,
            quantity: line.quantity,
            unitPrice: Number(line.unitPrice),
            lineTotal: Number(line.lineTotal),
            movement,
          }
        })
      )

      let journalEntry: SaleInvoiceDocumentFlow['journalEntry'] = null
      if (invoice.journalEntryId) {
        const [entryRow] = await db
          .select()
          .from(journalEntries)
          .where(eq(journalEntries.id, invoice.journalEntryId))
          .limit(1)
        if (entryRow) {
          const entryLineRows = await db
            .select({
              accountId: chartOfAccounts.id,
              accountCode: chartOfAccounts.code,
              accountName: chartOfAccounts.name,
              debit: journalEntryLines.debit,
              credit: journalEntryLines.credit,
            })
            .from(journalEntryLines)
            .innerJoin(chartOfAccounts, eq(journalEntryLines.accountId, chartOfAccounts.id))
            .where(eq(journalEntryLines.journalEntryId, entryRow.id))

          journalEntry = {
            id: entryRow.id,
            entryNumber: entryRow.entryNumber,
            entryDate: entryRow.entryDate,
            status: entryRow.status,
            lines: entryLineRows.map((l) => ({
              accountId: l.accountId,
              accountCode: l.accountCode,
              accountName: l.accountName,
              debit: Number(l.debit),
              credit: Number(l.credit),
            })),
          }
        }
      }

      return {
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          branchId: invoice.branchId,
          sourceType: invoice.sourceType,
          customerName: invoice.customerName,
          status: invoice.status,
          subtotal: Number(invoice.subtotal),
          taxTotal: Number(invoice.taxTotal),
          total: Number(invoice.total),
          occurredAt: invoice.occurredAt,
        },
        lines,
        journalEntry,
      }
    },
  }
}

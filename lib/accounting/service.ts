import { eq, and, sql, sum } from 'drizzle-orm'
import {
  accountMappings,
  journalEntries,
  journalEntryLines,
  supplierInvoices,
  supplierPayments,
  saleInvoices,
  saleInvoiceLines,
} from '@/db/schema'
import type { Db, Tx } from '@/db/client'
import { readInventoryCost } from '../ledger/balance'
import type {
  AccountingService,
  AccountMappingKey,
  PostJournalEntryInput,
  PostJournalEntryResult,
} from './types'

async function resolveAccountId(tx: Tx, tenantId: string, key: AccountMappingKey): Promise<string> {
  const [mapping] = await tx
    .select({ accountId: accountMappings.accountId })
    .from(accountMappings)
    .where(and(eq(accountMappings.tenantId, tenantId), eq(accountMappings.key, key)))
    .limit(1)
  if (!mapping) {
    throw new Error(
      `No account_mappings row for tenant ${tenantId}, key "${key}" — set up the chart of ` +
        `accounts and account_mappings before posting journal entries.`
    )
  }
  return mapping.accountId
}

function round2(n: number): string {
  return n.toFixed(2)
}

async function postJournalEntryInTx(
  tx: Tx,
  input: PostJournalEntryInput
): Promise<PostJournalEntryResult> {
  const totalDebit = input.lines.reduce((acc, l) => acc + (l.debit ?? 0), 0)
  const totalCredit = input.lines.reduce((acc, l) => acc + (l.credit ?? 0), 0)
  if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
    throw new Error(
      `Unbalanced journal entry: debit total ${totalDebit} !== credit total ${totalCredit} ` +
        `(sourceType=${input.sourceType}, sourceReference=${input.sourceReference ?? 'n/a'})`
    )
  }

  const entryNumber = input.sourceReference
    ? `AUTO-${input.sourceType.toUpperCase()}-${input.sourceReference}`
    : `AUTO-${input.sourceType.toUpperCase()}-${crypto.randomUUID()}`

  const [entryRow] = await tx
    .insert(journalEntries)
    .values({
      tenantId: input.tenantId,
      branchId: input.branchId,
      entryNumber,
      entryDate: input.entryDate,
      description: input.description,
      sourceType: input.sourceType,
      sourceReference: input.sourceReference,
      status: 'posted',
    })
    .onConflictDoNothing({
      target: [journalEntries.tenantId, journalEntries.sourceType, journalEntries.sourceReference],
      where: sql`${journalEntries.sourceReference} IS NOT NULL`,
    })
    .returning({ id: journalEntries.id })

  if (!entryRow) {
    if (!input.sourceReference) throw new Error('Unexpected conflict on a sourceless journal entry')
    const [existing] = await tx
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.tenantId, input.tenantId),
          eq(journalEntries.sourceType, input.sourceType),
          eq(journalEntries.sourceReference, input.sourceReference)
        )
      )
      .limit(1)
    return { status: 'duplicate', journalEntryId: existing.id }
  }

  const journalEntryId = entryRow.id

  for (const line of input.lines) {
    const accountId = await resolveAccountId(tx, input.tenantId, line.accountKey)
    await tx.insert(journalEntryLines).values({
      journalEntryId,
      accountId,
      debit: round2(line.debit ?? 0),
      credit: round2(line.credit ?? 0),
      description: line.description,
    })
  }

  return { status: 'accepted', journalEntryId }
}

export function createAccountingService(db: Db): AccountingService {
  return {
    async postJournalEntry(input: PostJournalEntryInput): Promise<PostJournalEntryResult> {
      return db.transaction((tx) => postJournalEntryInTx(tx, input))
    },

    async postSupplierInvoiceJournal(tenantId: string, supplierInvoiceId: string) {
      return db.transaction(async (tx) => {
        const [invoice] = await tx
          .select()
          .from(supplierInvoices)
          .where(and(eq(supplierInvoices.id, supplierInvoiceId), eq(supplierInvoices.tenantId, tenantId)))
          .limit(1)
        if (!invoice) throw new Error(`supplier_invoice ${supplierInvoiceId} not found for tenant`)

        const subtotal = Number(invoice.subtotal)
        const taxTotal = Number(invoice.taxTotal)
        const total = Number(invoice.total)

        const result = await postJournalEntryInTx(tx, {
          tenantId,
          branchId: invoice.branchId ?? undefined,
          entryDate: new Date(invoice.invoiceDate),
          sourceType: 'purchase_invoice',
          sourceReference: invoice.id,
          description: `Supplier invoice ${invoice.invoiceNumber}`,
          lines: [
            { accountKey: 'inventory_asset', debit: subtotal },
            ...(taxTotal > 0 ? [{ accountKey: 'input_tax' as const, debit: taxTotal }] : []),
            { accountKey: 'accounts_payable', credit: total },
          ],
        })

        await tx
          .update(supplierInvoices)
          .set({ journalEntryId: result.journalEntryId })
          .where(eq(supplierInvoices.id, supplierInvoiceId))

        return result
      })
    },

    async postSupplierPaymentJournal(tenantId: string, supplierPaymentId: string) {
      return db.transaction(async (tx) => {
        const [payment] = await tx
          .select()
          .from(supplierPayments)
          .where(and(eq(supplierPayments.id, supplierPaymentId), eq(supplierPayments.tenantId, tenantId)))
          .limit(1)
        if (!payment) throw new Error(`supplier_payment ${supplierPaymentId} not found for tenant`)

        const amount = Number(payment.amount)

        const result = await postJournalEntryInTx(tx, {
          tenantId,
          branchId: payment.branchId ?? undefined,
          entryDate: new Date(payment.paymentDate),
          sourceType: 'supplier_payment',
          sourceReference: payment.id,
          description: `Supplier payment ${payment.id}`,
          lines: [
            { accountKey: 'accounts_payable', debit: amount },
            { accountKey: 'cash', credit: amount },
          ],
        })

        await tx
          .update(supplierPayments)
          .set({ journalEntryId: result.journalEntryId })
          .where(eq(supplierPayments.id, supplierPaymentId))

        if (payment.supplierInvoiceId) {
          const [invoice] = await tx
            .select({ total: supplierInvoices.total })
            .from(supplierInvoices)
            .where(eq(supplierInvoices.id, payment.supplierInvoiceId))
            .limit(1)
          const [paidSum] = await tx
            .select({ paid: sum(supplierPayments.amount) })
            .from(supplierPayments)
            .where(eq(supplierPayments.supplierInvoiceId, payment.supplierInvoiceId))

          if (invoice) {
            const totalPaid = Number(paidSum?.paid ?? 0)
            const invoiceTotal = Number(invoice.total)
            const status =
              totalPaid >= invoiceTotal ? 'paid' : totalPaid > 0 ? 'partially_paid' : 'unpaid'
            await tx
              .update(supplierInvoices)
              .set({ status })
              .where(eq(supplierInvoices.id, payment.supplierInvoiceId))
          }
        }

        return result
      })
    },

    async postSaleInvoiceJournal(tenantId: string, saleInvoiceId: string) {
      return db.transaction(async (tx) => {
        const [invoice] = await tx
          .select()
          .from(saleInvoices)
          .where(and(eq(saleInvoices.id, saleInvoiceId), eq(saleInvoices.tenantId, tenantId)))
          .limit(1)
        if (!invoice) throw new Error(`sale_invoice ${saleInvoiceId} not found for tenant`)

        const subtotal = Number(invoice.subtotal)
        const discountTotal = Number(invoice.discountTotal)
        const taxTotal = Number(invoice.taxTotal)
        const total = Number(invoice.total)
        const netRevenue = subtotal - discountTotal

        // COGS: sum(quantity * average cost at this branch) across the
        // invoice's lines, using inventory_balances.averageCost as it stands
        // *now* (at posting time), not the cost frozen at the moment of sale
        // — sale_invoice_lines has no cost column yet, so there's nothing to
        // freeze. If purchases happen between the sale and this posting, the
        // COGS figure reflects the current weighted average, not the true
        // historical cost. Documented simplification, not a bug — see
        // docs/ARCHITECTURE.md.
        const lines = await tx
          .select({ sku: saleInvoiceLines.sku, quantity: saleInvoiceLines.quantity })
          .from(saleInvoiceLines)
          .where(eq(saleInvoiceLines.invoiceId, saleInvoiceId))

        let totalCogs = 0
        for (const line of lines) {
          const cost = await readInventoryCost(tx, tenantId, invoice.branchId, line.sku)
          totalCogs += cost * line.quantity
        }
        totalCogs = Math.round(totalCogs * 100) / 100

        const result = await postJournalEntryInTx(tx, {
          tenantId,
          branchId: invoice.branchId,
          entryDate: new Date(invoice.occurredAt),
          sourceType: 'sale_invoice',
          sourceReference: invoice.id,
          description: `Sale invoice ${invoice.invoiceNumber}`,
          lines: [
            { accountKey: 'cash', debit: total },
            { accountKey: 'sales_revenue', credit: netRevenue },
            ...(taxTotal > 0 ? [{ accountKey: 'output_tax_payable' as const, credit: taxTotal }] : []),
            ...(totalCogs > 0
              ? [
                  { accountKey: 'cogs' as const, debit: totalCogs },
                  { accountKey: 'inventory_asset' as const, credit: totalCogs },
                ]
              : []),
          ],
        })

        await tx
          .update(saleInvoices)
          .set({ journalEntryId: result.journalEntryId })
          .where(eq(saleInvoices.id, saleInvoiceId))

        return result
      })
    },
  }
}

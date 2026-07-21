import { pgTable, uuid, text, integer } from 'drizzle-orm/pg-core'
import { stockTransfers } from './stock-transfers'
import { inventoryMovements } from './inventory-movements'

export const stockTransferLines = pgTable('stock_transfer_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  transferId: uuid('transfer_id')
    .notNull()
    .references(() => stockTransfers.id, { onDelete: 'cascade' }),
  sku: text('sku').notNull(),
  quantity: integer('quantity').notNull(),
  // Populated once the transfer is posted (future application logic) — the
  // transfer_out movement at fromBranchId and the transfer_in movement at
  // toBranchId this line generated. Same closing-the-loop pattern as
  // sale_invoice_lines.inventoryMovementId and goods_receipt_lines.
  fromMovementId: uuid('from_movement_id').references(() => inventoryMovements.id),
  toMovementId: uuid('to_movement_id').references(() => inventoryMovements.id),
})

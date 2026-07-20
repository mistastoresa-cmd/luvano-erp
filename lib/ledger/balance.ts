import { sql, eq, and } from 'drizzle-orm'
import { inventoryBalances } from '@/db/schema'
import type { DbOrTx } from '@/db/client'

// See docs/design-spikes/01-conflict-resolution.md for the full reasoning.
//
// A single INSERT ... ON CONFLICT DO UPDATE statement, where the update sets
// `quantity = inventory_balances.quantity + $delta`. Postgres evaluates the
// right-hand side against the *current* row value at update time, and the
// unique index on (tenant_id, branch_id, sku) makes this a single atomic
// statement — two concurrent writers (a Salla webhook and a branch POS sale
// hitting the same SKU at the same instant) never lose an update. Postgres's
// row-level locking on the UPDATE serializes them automatically; no optimistic
// retry loop is needed.
//
// This function deliberately never throws or blocks on a negative resulting
// quantity — going negative just makes `oversold: true` in the return value,
// so the caller can raise a reconciliation_alerts row. Blocking the write here
// would mean refusing to record a sale that already happened in the real world.
export async function applyInventoryDelta(
  db: DbOrTx,
  tenantId: string,
  branchId: string,
  sku: string,
  delta: number
): Promise<{ resultingQuantity: number; oversold: boolean }> {
  const [row] = await db
    .insert(inventoryBalances)
    .values({ tenantId, branchId, sku, quantity: delta })
    .onConflictDoUpdate({
      target: [inventoryBalances.tenantId, inventoryBalances.branchId, inventoryBalances.sku],
      set: {
        quantity: sql`${inventoryBalances.quantity} + ${delta}`,
        version: sql`${inventoryBalances.version} + 1`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ quantity: inventoryBalances.quantity })

  const resultingQuantity = row.quantity
  return { resultingQuantity, oversold: resultingQuantity < 0 }
}

export async function readInventoryBalance(
  db: DbOrTx,
  tenantId: string,
  branchId: string,
  sku: string
): Promise<number> {
  const [row] = await db
    .select({ quantity: inventoryBalances.quantity })
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.tenantId, tenantId),
        eq(inventoryBalances.branchId, branchId),
        eq(inventoryBalances.sku, sku)
      )
    )
    .limit(1)

  return row?.quantity ?? 0
}

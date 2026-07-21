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

// Same atomic upsert as applyInventoryDelta, plus weighted-average cost
// blending on cost-bearing increases. Blending only happens when both
// `delta > 0` and `unitCost` is given — a sale/transfer-out/adjustment
// (delta <= 0) or a call with no known unit cost leaves average_cost
// untouched, exactly like calling applyInventoryDelta. If the *current*
// quantity is <= 0 (e.g. after an earlier oversell), blending against it is
// not meaningful, so the new unit cost simply replaces it as a fresh
// baseline instead of averaging against a negative/zero base.
export async function applyInventoryDeltaWithCost(
  db: DbOrTx,
  tenantId: string,
  branchId: string,
  sku: string,
  delta: number,
  unitCost?: number
): Promise<{ resultingQuantity: number; oversold: boolean; averageCost: number }> {
  const shouldBlend = delta > 0 && unitCost !== undefined

  const [row] = await db
    .insert(inventoryBalances)
    .values({
      tenantId,
      branchId,
      sku,
      quantity: delta,
      averageCost: shouldBlend ? unitCost.toFixed(4) : '0',
    })
    .onConflictDoUpdate({
      target: [inventoryBalances.tenantId, inventoryBalances.branchId, inventoryBalances.sku],
      set: {
        quantity: sql`${inventoryBalances.quantity} + ${delta}`,
        version: sql`${inventoryBalances.version} + 1`,
        updatedAt: sql`now()`,
        ...(shouldBlend
          ? {
              // Explicit ::numeric casts on every bound parameter — pglite's
              // (and Postgres's) type resolver can't disambiguate the `*`
              // operator when a parameter's type is otherwise inferred only
              // from context ("operator is not unique: unknown * unknown"),
              // which surfaces here specifically because this expression mixes
              // a bound parameter on both sides of an arithmetic operator.
              averageCost: sql`CASE WHEN ${inventoryBalances.quantity} <= 0 THEN ${unitCost}::numeric
                ELSE (${inventoryBalances.quantity} * ${inventoryBalances.averageCost} + ${delta}::numeric * ${unitCost}::numeric)
                     / (${inventoryBalances.quantity} + ${delta}::numeric)
                END`,
            }
          : {}),
      },
    })
    .returning({ quantity: inventoryBalances.quantity, averageCost: inventoryBalances.averageCost })

  const resultingQuantity = row.quantity
  return {
    resultingQuantity,
    oversold: resultingQuantity < 0,
    averageCost: Number(row.averageCost),
  }
}

export async function readInventoryCost(
  db: DbOrTx,
  tenantId: string,
  branchId: string,
  sku: string
): Promise<number> {
  const [row] = await db
    .select({ averageCost: inventoryBalances.averageCost })
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.tenantId, tenantId),
        eq(inventoryBalances.branchId, branchId),
        eq(inventoryBalances.sku, sku)
      )
    )
    .limit(1)

  return row ? Number(row.averageCost) : 0
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

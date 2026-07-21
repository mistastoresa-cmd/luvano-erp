import { reconciliationAlerts } from '@/db/schema'
import type { DbOrTx } from '@/db/client'

// Shared by every module that writes through applyInventoryDelta (ledger,
// purchasing, warehouse) — one place implementing the "never block, always
// alert" policy from docs/design-spikes/01-conflict-resolution.md.
export async function raiseOversellAlert(
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

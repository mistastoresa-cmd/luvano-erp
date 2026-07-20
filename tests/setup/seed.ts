import { tenants, branches } from '@/db/schema'
import type { Db } from '@/db/client'

export async function seedTenantWithBranch(db: Db) {
  const [tenant] = await db.insert(tenants).values({ name: 'Test Tenant' }).returning()
  const [onlineBranch] = await db
    .insert(branches)
    .values({ tenantId: tenant.id, name: 'Salla Store', code: 'ONLINE', type: 'online' })
    .returning()
  const [physicalBranch] = await db
    .insert(branches)
    .values({ tenantId: tenant.id, name: 'Riyadh Branch', code: 'RIYADH-01', type: 'physical' })
    .returning()
  return { tenant, onlineBranch, physicalBranch }
}

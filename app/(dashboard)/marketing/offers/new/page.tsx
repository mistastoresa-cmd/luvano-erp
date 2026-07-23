import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { products } from '@/db/schema'
import { NewOfferClient } from './new-offer-client'

export default async function NewOfferPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId } = session

  const db = await getDb()
  const productRows = await db
    .select({ id: products.id, name: products.name, category: products.category })
    .from(products)
    .where(eq(products.tenantId, tenantId))
    .orderBy(products.name)

  const categories = [...new Set(productRows.map((p) => p.category).filter((c): c is string => !!c))]

  return (
    <NewOfferClient
      products={productRows.map((p) => ({ id: p.id, name: p.name }))}
      categories={categories}
    />
  )
}

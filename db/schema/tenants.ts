import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // Nullable: a tenant can exist (e.g. created during onboarding/sales conversation)
  // before its Salla store is actually connected.
  sallaStoreId: text('salla_store_id').unique(),
  status: text('status', { enum: ['active', 'suspended'] })
    .notNull()
    .default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

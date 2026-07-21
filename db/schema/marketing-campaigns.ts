import { pgTable, uuid, text, numeric, date, timestamp } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

export const marketingCampaigns = pgTable('marketing_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  name: text('name').notNull(),
  channel: text('channel', {
    enum: ['tiktok', 'snapchat', 'instagram', 'google', 'email', 'whatsapp', 'other'],
  }).notNull(),
  budget: numeric('budget', { precision: 12, scale: 2 }),
  startDate: date('start_date'),
  endDate: date('end_date'),
  status: text('status', { enum: ['draft', 'active', 'paused', 'completed'] })
    .notNull()
    .default('draft'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

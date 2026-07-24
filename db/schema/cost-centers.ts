import { pgTable, uuid, text, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

// مراكز التكلفة — بُعد تحليلي مستقل عن الفروع. الفرع يجيب "أين صُرف؟"،
// ومركز التكلفة يجيب "على ماذا صُرف؟" (قسم التسويق، مشروع رمضان، خط إنتاج).
// نفس المصروف قد يخص فرع الرياض ومركز تكلفة "التسويق" في آن واحد، فالبُعدان
// منفصلان عمداً بدل حشر الاثنين في حقل واحد.
export const costCenters = pgTable(
  'cost_centers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('cost_centers_tenant_code_idx').on(table.tenantId, table.code)]
)

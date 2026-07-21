import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { branches } from './branches'

// سجل تدقيق لمحاولات وصول مرفوضة (RBAC T8) — من رُفض، لماذا، ووصول لأي
// مورد. كتابة "fire-and-forget" غير مُنتظَرة من نقطة الرفض نفسها
// (lib/authz/service.ts::assertRoleAudited/assertBranchAccessAudited) —
// فشل الكتابة لا يجب أبداً أن يقلب رفضاً صحيحاً إلى سماح، ولا يضيف زمن
// انتظار على مسار الرفض نفسه.
export const authzDenials = pgTable(
  'authz_denials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: text('user_id').notNull(),
    role: text('role').notNull(),
    checkType: text('check_type', { enum: ['role', 'branch'] }).notNull(),
    // مُعبَّأ فقط عند checkType='role' — الأدوار المسموحة اللي فشل المستخدم
    // بتحقيقها، مفصولة بفواصل (بدل جدول منفصل — للقراءة فقط، لا استعلام بها).
    requiredRoles: text('required_roles'),
    // مُعبَّأ فقط عند checkType='branch'.
    branchId: uuid('branch_id').references(() => branches.id),
    message: text('message').notNull(),
    deniedAt: timestamp('denied_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('authz_denials_tenant_denied_at_idx').on(table.tenantId, table.deniedAt)]
)

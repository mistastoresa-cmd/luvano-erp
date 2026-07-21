import { pgTable, uuid, text, numeric, date, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { branches } from './branches'
import { user } from './auth'

export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    // رقم وظيفي تسلسلي مُولَّد تلقائياً عند التسجيل (lib/employees/service.ts
    // عبر employee_number_counters) — مرجع الموظف بكل المخاطبات والتقارير،
    // لا يُدخله المستخدم يدوياً.
    employeeNumber: text('employee_number').notNull(),
    // موقع العمل الأساسي — موظف قد يتنقل بين فروع، لكن هذا مرجعي فقط بهذي
    // المرحلة (بلا سجل تنقلات).
    branchId: uuid('branch_id').references(() => branches.id),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    // رقم الهوية/الإقامة — نص لا رقم، لدعم صيغ متعددة بلا فرض تنسيق مبكراً.
    nationalId: text('national_id'),
    idType: text('id_type', { enum: ['national_id', 'iqama'] }).notNull().default('national_id'),
    // تاريخ انتهاء الإقامة — ذو صلة فقط لغير السعوديين (idType='iqama').
    idExpiryDate: date('id_expiry_date'),
    nationality: text('nationality'),
    jobTitle: text('job_title'),
    department: text('department'),
    hireDate: date('hire_date').notNull(),
    baseSalary: numeric('base_salary', { precision: 12, scale: 2 }).notNull(),
    // نوع العقد — يؤثر على تاريخ الانتهاء المتوقَّع وحساب مكافأة نهاية
    // الخدمة (م. ٥٥ من نظام العمل: العقد محدد المدة ينتهي بانتهاء مدته).
    contractType: text('contract_type', { enum: ['unlimited', 'fixed_term'] })
      .notNull()
      .default('unlimited'),
    contractEndDate: date('contract_end_date'),
    probationEndDate: date('probation_end_date'),
    gosiNumber: text('gosi_number'),
    ibanNumber: text('iban_number'),
    // ربط تسجيل الدخول (Better Auth) — عمود مُجهَّز فقط بهذي الدفعة، بلا
    // تدفق دعوة/مصادقة فعلي بعد (يحتاج دور RBAC 'employee' جديد وربط
    // بـ lib/authz — مؤجَّل لدفعة RBAC T7/T8 القادمة).
    userId: text('user_id').references(() => user.id),
    status: text('status', { enum: ['active', 'on_leave', 'terminated'] })
      .notNull()
      .default('active'),
    terminatedAt: date('terminated_at'),
    // سبب انتهاء الخدمة — يحدد نسبة مكافأة نهاية الخدمة عند الاستقالة
    // (م. ٨٥): أقل من سنتين = صفر، ٢-٥ سنوات = ثلث، ٥-١٠ = ثلثين، ١٠+ = كامل.
    // إنهاء من صاحب العمل أو انتهاء عقد محدد المدة = مكافأة كاملة دائماً.
    terminationReason: text('termination_reason', {
      enum: ['resignation', 'employer_termination', 'contract_end', 'other'],
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('employees_tenant_national_id_idx').on(table.tenantId, table.nationalId),
    uniqueIndex('employees_tenant_employee_number_idx').on(table.tenantId, table.employeeNumber),
  ]
)

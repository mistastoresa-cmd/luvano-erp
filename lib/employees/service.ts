import { eq, and, sql } from 'drizzle-orm'
import { employees, employeeNumberCounters } from '@/db/schema'
import type { Db, Tx } from '@/db/client'
import { assertRoleAudited, assertBranchAccessAudited } from '../authz/service'
import type { CallerContext } from '../authz/types'
import type {
  EmployeesService,
  CreateEmployeeInput,
  UpdateEmployeeInput,
  Employee,
} from './types'

const HR_ROLES = ['owner', 'accountant', 'branch_manager'] as const

function toEmployee(row: typeof employees.$inferSelect): Employee {
  return {
    id: row.id,
    tenantId: row.tenantId,
    employeeNumber: row.employeeNumber,
    branchId: row.branchId,
    name: row.name,
    phone: row.phone,
    email: row.email,
    nationalId: row.nationalId,
    idType: row.idType,
    idExpiryDate: row.idExpiryDate,
    nationality: row.nationality,
    jobTitle: row.jobTitle,
    department: row.department,
    hireDate: row.hireDate,
    baseSalary: Number(row.baseSalary),
    contractType: row.contractType,
    contractEndDate: row.contractEndDate,
    probationEndDate: row.probationEndDate,
    gosiNumber: row.gosiNumber,
    ibanNumber: row.ibanNumber,
    userId: row.userId,
    status: row.status,
    terminatedAt: row.terminatedAt,
    terminationReason: row.terminationReason,
    createdAt: row.createdAt,
  }
}

// Atomically allocates the next employee number for a tenant — same
// INSERT...ON CONFLICT DO UPDATE...RETURNING idiom as redeemCoupon's
// guarded increment, race-safe under concurrent registrations. Works
// whether or not the tenant already has a counter row: the freshly
// inserted value (2) minus 1 gives the first assignable number (1); an
// existing row's post-increment value minus 1 gives its pre-increment
// value, i.e. the number this call should assign.
async function allocateEmployeeNumber(tx: Tx, tenantId: string): Promise<string> {
  const [row] = await tx
    .insert(employeeNumberCounters)
    .values({ tenantId, nextNumber: 2 })
    .onConflictDoUpdate({
      target: employeeNumberCounters.tenantId,
      set: { nextNumber: sql`${employeeNumberCounters.nextNumber} + 1` },
    })
    .returning({ nextNumber: employeeNumberCounters.nextNumber })

  const assigned = row.nextNumber - 1
  return `EMP-${String(assigned).padStart(4, '0')}`
}

export function createEmployeesService(db: Db): EmployeesService {
  return {
    async createEmployee(context: CallerContext, input: CreateEmployeeInput): Promise<Employee> {
      assertRoleAudited(db, input.tenantId, context, [...HR_ROLES])
      if (input.branchId) assertBranchAccessAudited(db, input.tenantId, context, input.branchId)
      return db.transaction(async (tx) => {
        const employeeNumber = await allocateEmployeeNumber(tx, input.tenantId)

        const [row] = await tx
          .insert(employees)
          .values({
            tenantId: input.tenantId,
            employeeNumber,
            branchId: input.branchId,
            name: input.name,
            phone: input.phone,
            email: input.email,
            nationalId: input.nationalId,
            idType: input.idType,
            idExpiryDate: input.idExpiryDate,
            nationality: input.nationality,
            jobTitle: input.jobTitle,
            department: input.department,
            hireDate: input.hireDate,
            baseSalary: input.baseSalary.toFixed(2),
            contractType: input.contractType,
            contractEndDate: input.contractEndDate,
            probationEndDate: input.probationEndDate,
            gosiNumber: input.gosiNumber,
            ibanNumber: input.ibanNumber,
          })
          .returning()

        return toEmployee(row)
      })
    },

    async updateEmployee(
      context: CallerContext,
      tenantId: string,
      employeeId: string,
      input: UpdateEmployeeInput
    ): Promise<Employee> {
      assertRoleAudited(db, tenantId, context, [...HR_ROLES])
      const [existing] = await db
        .select({ branchId: employees.branchId })
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId)))
        .limit(1)
      if (existing?.branchId) assertBranchAccessAudited(db, tenantId, context, existing.branchId)
      if (input.branchId) assertBranchAccessAudited(db, tenantId, context, input.branchId)

      const [row] = await db
        .update(employees)
        .set({
          ...input,
          baseSalary: input.baseSalary !== undefined ? input.baseSalary.toFixed(2) : undefined,
        })
        .where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId)))
        .returning()
      if (!row) throw new Error('Employee not found')
      return toEmployee(row)
    },

    async getEmployee(context: CallerContext, tenantId: string, employeeId: string): Promise<Employee | null> {
      assertRoleAudited(db, tenantId, context, [...HR_ROLES])
      const [row] = await db
        .select()
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId)))
        .limit(1)
      return row ? toEmployee(row) : null
    },

    async listEmployees(context: CallerContext, tenantId: string): Promise<Employee[]> {
      assertRoleAudited(db, tenantId, context, [...HR_ROLES])
      const rows = await db.select().from(employees).where(eq(employees.tenantId, tenantId))
      return rows.map(toEmployee)
    },
  }
}

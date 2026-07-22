import { eq, and, desc } from 'drizzle-orm'
import { customers, customerInteractions } from '@/db/schema'
import type { Db } from '@/db/client'
import { assertRoleAudited } from '../authz/service'
import type { CallerContext } from '../authz/types'
import type {
  CustomersService,
  CreateCustomerInput,
  UpdateCustomerInput,
  Customer,
  LogInteractionInput,
  CustomerInteraction,
} from './types'

const CRM_ROLES = ['owner', 'accountant', 'branch_manager', 'staff'] as const

export function createCustomersService(db: Db): CustomersService {
  return {
    async createCustomer(context: CallerContext, input: CreateCustomerInput): Promise<Customer> {
      assertRoleAudited(db, input.tenantId, context, [...CRM_ROLES])
      const [customer] = await db
        .insert(customers)
        .values({
          tenantId: input.tenantId,
          name: input.name,
          phone: input.phone,
          email: input.email,
          sallaCustomerId: input.sallaCustomerId,
          notes: input.notes,
        })
        .returning()
      return customer
    },

    async updateCustomer(
      context: CallerContext,
      tenantId: string,
      customerId: string,
      input: UpdateCustomerInput
    ): Promise<Customer> {
      assertRoleAudited(db, tenantId, context, [...CRM_ROLES])
      const [customer] = await db
        .update(customers)
        .set(input)
        .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)))
        .returning()
      if (!customer) throw new Error('Customer not found')
      return customer
    },

    async getCustomer(context: CallerContext, tenantId: string, customerId: string): Promise<Customer | null> {
      assertRoleAudited(db, tenantId, context, [...CRM_ROLES])
      const [customer] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)))
        .limit(1)
      return customer ?? null
    },

    async listCustomers(context: CallerContext, tenantId: string): Promise<Customer[]> {
      assertRoleAudited(db, tenantId, context, [...CRM_ROLES])
      return db.select().from(customers).where(eq(customers.tenantId, tenantId))
    },

    async logInteraction(context: CallerContext, input: LogInteractionInput): Promise<CustomerInteraction> {
      assertRoleAudited(db, input.tenantId, context, [...CRM_ROLES])
      const [interaction] = await db
        .insert(customerInteractions)
        .values({
          tenantId: input.tenantId,
          customerId: input.customerId,
          type: input.type,
          summary: input.summary,
          createdBy: input.createdBy,
        })
        .returning()
      return interaction
    },

    async listInteractions(
      context: CallerContext,
      tenantId: string,
      customerId: string
    ): Promise<CustomerInteraction[]> {
      assertRoleAudited(db, tenantId, context, [...CRM_ROLES])
      return db
        .select()
        .from(customerInteractions)
        .where(
          and(
            eq(customerInteractions.tenantId, tenantId),
            eq(customerInteractions.customerId, customerId)
          )
        )
        .orderBy(desc(customerInteractions.createdAt))
    },
  }
}

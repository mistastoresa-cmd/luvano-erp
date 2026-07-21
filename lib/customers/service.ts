import { eq, and, desc } from 'drizzle-orm'
import { customers, customerInteractions } from '@/db/schema'
import type { Db } from '@/db/client'
import type {
  CustomersService,
  CreateCustomerInput,
  UpdateCustomerInput,
  Customer,
  LogInteractionInput,
  CustomerInteraction,
} from './types'

export function createCustomersService(db: Db): CustomersService {
  return {
    async createCustomer(input: CreateCustomerInput): Promise<Customer> {
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
      tenantId: string,
      customerId: string,
      input: UpdateCustomerInput
    ): Promise<Customer> {
      const [customer] = await db
        .update(customers)
        .set(input)
        .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)))
        .returning()
      if (!customer) throw new Error('Customer not found')
      return customer
    },

    async getCustomer(tenantId: string, customerId: string): Promise<Customer | null> {
      const [customer] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)))
        .limit(1)
      return customer ?? null
    },

    async listCustomers(tenantId: string): Promise<Customer[]> {
      return db.select().from(customers).where(eq(customers.tenantId, tenantId))
    },

    async logInteraction(input: LogInteractionInput): Promise<CustomerInteraction> {
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

    async listInteractions(tenantId: string, customerId: string): Promise<CustomerInteraction[]> {
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

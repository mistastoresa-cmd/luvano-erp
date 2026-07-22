import type { CallerContext } from '../authz/types'

export interface CreateCustomerInput {
  tenantId: string
  name: string
  phone?: string
  email?: string
  sallaCustomerId?: string
  notes?: string
}

export interface UpdateCustomerInput {
  name?: string
  phone?: string
  email?: string
  notes?: string
}

export interface Customer {
  id: string
  tenantId: string
  name: string
  phone: string | null
  email: string | null
  sallaCustomerId: string | null
  notes: string | null
  createdAt: Date
}

export type InteractionType = 'call' | 'note' | 'complaint' | 'follow_up'

export interface LogInteractionInput {
  tenantId: string
  customerId: string
  type: InteractionType
  summary: string
  createdBy?: string
}

export interface CustomerInteraction {
  id: string
  tenantId: string
  customerId: string
  type: InteractionType
  summary: string
  createdBy: string | null
  createdAt: Date
}

// CRM data entry — routine, open to all 4 roles (any staff can register a
// walk-in customer or log a call), unlike the financial/HR services where
// staff is excluded (RBAC extension beyond the original T7 scope — see
// docs/ARCHITECTURE.md).
export interface CustomersService {
  createCustomer(context: CallerContext, input: CreateCustomerInput): Promise<Customer>
  updateCustomer(
    context: CallerContext,
    tenantId: string,
    customerId: string,
    input: UpdateCustomerInput
  ): Promise<Customer>
  getCustomer(context: CallerContext, tenantId: string, customerId: string): Promise<Customer | null>
  listCustomers(context: CallerContext, tenantId: string): Promise<Customer[]>
  logInteraction(context: CallerContext, input: LogInteractionInput): Promise<CustomerInteraction>
  listInteractions(
    context: CallerContext,
    tenantId: string,
    customerId: string
  ): Promise<CustomerInteraction[]>
}

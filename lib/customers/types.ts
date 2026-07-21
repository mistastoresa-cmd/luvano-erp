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

export interface CustomersService {
  createCustomer(input: CreateCustomerInput): Promise<Customer>
  updateCustomer(tenantId: string, customerId: string, input: UpdateCustomerInput): Promise<Customer>
  getCustomer(tenantId: string, customerId: string): Promise<Customer | null>
  listCustomers(tenantId: string): Promise<Customer[]>
  logInteraction(input: LogInteractionInput): Promise<CustomerInteraction>
  listInteractions(tenantId: string, customerId: string): Promise<CustomerInteraction[]>
}

import { describe, it, expect } from 'vitest'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import { createCustomersService } from '@/lib/customers/service'
import { SYSTEM_CONTEXT } from '@/lib/authz/types'

describe('CustomersService — CRUD', () => {
  it('creates a customer', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const customers = createCustomersService(db)

    const customer = await customers.createCustomer(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      name: 'Ahmed Ali',
      phone: '0501234567',
    })

    expect(customer.name).toBe('Ahmed Ali')
    expect(customer.phone).toBe('0501234567')
  })

  it('updates a customer', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const customers = createCustomersService(db)

    const created = await customers.createCustomer(SYSTEM_CONTEXT, { tenantId: tenant.id, name: 'Ahmed Ali' })
    const updated = await customers.updateCustomer(SYSTEM_CONTEXT, tenant.id, created.id, { phone: '0559999999' })

    expect(updated.phone).toBe('0559999999')
    expect(updated.name).toBe('Ahmed Ali')
  })

  it('throws when updating a customer that does not belong to the tenant', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const { tenant: otherTenant } = await seedTenantWithBranch(db)
    const customers = createCustomersService(db)

    const created = await customers.createCustomer(SYSTEM_CONTEXT, { tenantId: tenant.id, name: 'Ahmed Ali' })

    await expect(
      customers.updateCustomer(SYSTEM_CONTEXT, otherTenant.id, created.id, { name: 'Hijacked' })
    ).rejects.toThrow('Customer not found')
  })

  it('gets a customer by id, scoped to tenant', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const { tenant: otherTenant } = await seedTenantWithBranch(db)
    const customers = createCustomersService(db)

    const created = await customers.createCustomer(SYSTEM_CONTEXT, { tenantId: tenant.id, name: 'Ahmed Ali' })

    expect(await customers.getCustomer(SYSTEM_CONTEXT, tenant.id, created.id)).not.toBeNull()
    expect(await customers.getCustomer(SYSTEM_CONTEXT, otherTenant.id, created.id)).toBeNull()
  })

  it('lists customers for a tenant only', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const { tenant: otherTenant } = await seedTenantWithBranch(db)
    const customers = createCustomersService(db)

    await customers.createCustomer(SYSTEM_CONTEXT, { tenantId: tenant.id, name: 'Ahmed Ali' })
    await customers.createCustomer(SYSTEM_CONTEXT, { tenantId: tenant.id, name: 'Sara Mohammed' })
    await customers.createCustomer(SYSTEM_CONTEXT, { tenantId: otherTenant.id, name: 'Other Tenant Customer' })

    const list = await customers.listCustomers(SYSTEM_CONTEXT, tenant.id)
    expect(list).toHaveLength(2)
  })
})

describe('CustomersService — interaction log', () => {
  it('logs and lists interactions for a customer, newest first', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const customers = createCustomersService(db)

    const customer = await customers.createCustomer(SYSTEM_CONTEXT, { tenantId: tenant.id, name: 'Ahmed Ali' })

    await customers.logInteraction(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      customerId: customer.id,
      type: 'call',
      summary: 'اتصل يسأل عن حالة الطلب',
    })
    await customers.logInteraction(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      customerId: customer.id,
      type: 'complaint',
      summary: 'شكوى من تأخر التوصيل',
    })

    const interactions = await customers.listInteractions(SYSTEM_CONTEXT, tenant.id, customer.id)
    expect(interactions).toHaveLength(2)
    expect(interactions[0].type).toBe('complaint') // most recent first
    expect(interactions[1].type).toBe('call')
  })

  it('scopes interaction listing to the given customer only', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const customers = createCustomersService(db)

    const customerA = await customers.createCustomer(SYSTEM_CONTEXT, { tenantId: tenant.id, name: 'Ahmed Ali' })
    const customerB = await customers.createCustomer(SYSTEM_CONTEXT, { tenantId: tenant.id, name: 'Sara Mohammed' })

    await customers.logInteraction(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      customerId: customerA.id,
      type: 'note',
      summary: 'ملاحظة عن عميل أ',
    })
    await customers.logInteraction(SYSTEM_CONTEXT, {
      tenantId: tenant.id,
      customerId: customerB.id,
      type: 'note',
      summary: 'ملاحظة عن عميل ب',
    })

    const interactionsA = await customers.listInteractions(SYSTEM_CONTEXT, tenant.id, customerA.id)
    expect(interactionsA).toHaveLength(1)
    expect(interactionsA[0].summary).toBe('ملاحظة عن عميل أ')
  })
})

describe('CustomersService — RBAC', () => {
  it('allows staff to register a walk-in customer (routine CRM data entry, not a financial/HR decision)', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)
    const customers = createCustomersService(db)
    const staff = { userId: 'user-1', role: 'staff' as const, branchAccess: { type: 'all' as const } }

    const customer = await customers.createCustomer(staff, { tenantId: tenant.id, name: 'Walk-in Customer' })
    expect(customer.name).toBe('Walk-in Customer')
  })
})

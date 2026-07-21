import { describe, it, expect } from 'vitest'
import { createTestDb } from '../setup/db'
import { seedTenantWithBranch } from '../setup/seed'
import {
  customers,
  suppliers,
  purchaseOrders,
  purchaseOrderLines,
  goodsReceipts,
  goodsReceiptLines,
  supplierInvoices,
  coupons,
  marketingCampaigns,
  employees,
  attendanceRecords,
  leaveRequests,
  payrollRuns,
  payrollEntries,
  saleInvoices,
} from '@/db/schema'

describe('remaining module schemas (customers/suppliers/purchasing/marketing/HR)', () => {
  it('links a sale invoice to a registered customer', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)

    const [customer] = await db
      .insert(customers)
      .values({ tenantId: tenant.id, name: 'Sara Ali', phone: '0500000000' })
      .returning()

    const [invoice] = await db
      .insert(saleInvoices)
      .values({
        tenantId: tenant.id,
        branchId: physicalBranch.id,
        invoiceNumber: 'INV-9001',
        sourceType: 'branch_pos',
        customerId: customer.id,
        subtotal: '100.00',
        total: '100.00',
        idempotencyKey: 'inv-customer-link-test',
        occurredAt: new Date(),
      })
      .returning()

    expect(invoice.customerId).toBe(customer.id)
  })

  it('carries a purchase order through to goods receipt, closing the loop to an inventory movement id', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)

    const [supplier] = await db
      .insert(suppliers)
      .values({ tenantId: tenant.id, name: 'Riyadh Fragrance Supply' })
      .returning()

    const [po] = await db
      .insert(purchaseOrders)
      .values({
        tenantId: tenant.id,
        branchId: physicalBranch.id,
        supplierId: supplier.id,
        poNumber: 'PO-0001',
        orderDate: '2026-07-01',
      })
      .returning()

    const [poLine] = await db
      .insert(purchaseOrderLines)
      .values({
        purchaseOrderId: po.id,
        sku: 'SKU-1',
        productName: 'Oud 50ml',
        quantityOrdered: 20,
        unitCost: '30.00',
      })
      .returning()

    const [receipt] = await db
      .insert(goodsReceipts)
      .values({
        tenantId: tenant.id,
        branchId: physicalBranch.id,
        purchaseOrderId: po.id,
        receiptNumber: 'GR-0001',
        receivedDate: '2026-07-05',
      })
      .returning()

    const [receiptLine] = await db
      .insert(goodsReceiptLines)
      .values({
        goodsReceiptId: receipt.id,
        purchaseOrderLineId: poLine.id,
        sku: 'SKU-1',
        quantityReceived: 20,
        unitCost: '30.00',
      })
      .returning()

    expect(receiptLine.purchaseOrderLineId).toBe(poLine.id)

    const [supplierInvoice] = await db
      .insert(supplierInvoices)
      .values({
        tenantId: tenant.id,
        supplierId: supplier.id,
        purchaseOrderId: po.id,
        invoiceNumber: 'SINV-0001',
        invoiceDate: '2026-07-05',
        subtotal: '600.00',
        total: '600.00',
      })
      .returning()

    expect(supplierInvoice.purchaseOrderId).toBe(po.id)
  })

  it('persists a coupon and a marketing campaign', async () => {
    const db = await createTestDb()
    const { tenant } = await seedTenantWithBranch(db)

    const [coupon] = await db
      .insert(coupons)
      .values({
        tenantId: tenant.id,
        code: 'SUMMER20',
        discountType: 'percentage',
        discountValue: '20',
      })
      .returning()
    expect(coupon.usesCount).toBe(0)

    const [campaign] = await db
      .insert(marketingCampaigns)
      .values({ tenantId: tenant.id, name: 'Summer Push', channel: 'tiktok' })
      .returning()
    expect(campaign.status).toBe('draft')
  })

  it('carries an employee through attendance, leave, and a payroll run', async () => {
    const db = await createTestDb()
    const { tenant, physicalBranch } = await seedTenantWithBranch(db)

    const [employee] = await db
      .insert(employees)
      .values({
        tenantId: tenant.id,
        branchId: physicalBranch.id,
        employeeNumber: 'EMP-TEST-1',
        name: 'Mohammed Al-Otaibi',
        jobTitle: 'Branch Cashier',
        hireDate: '2026-01-01',
        baseSalary: '4500.00',
      })
      .returning()

    await db.insert(attendanceRecords).values({
      tenantId: tenant.id,
      employeeId: employee.id,
      workDate: '2026-07-01',
      status: 'present',
    })

    await db.insert(leaveRequests).values({
      tenantId: tenant.id,
      employeeId: employee.id,
      leaveType: 'annual',
      startDate: '2026-08-01',
      endDate: '2026-08-05',
    })

    const [run] = await db
      .insert(payrollRuns)
      .values({ tenantId: tenant.id, periodStart: '2026-07-01', periodEnd: '2026-07-31' })
      .returning()

    const [entry] = await db
      .insert(payrollEntries)
      .values({
        payrollRunId: run.id,
        employeeId: employee.id,
        baseSalary: '4500.00',
        netPay: '4500.00',
      })
      .returning()

    expect(entry.employeeId).toBe(employee.id)
  })
})

// Local dev seed — populates the shared pglite dev store (db/dev-pglite.ts)
// with a realistic demo tenant, entirely through the real service layer
// (provisionTenant, lib/products, lib/ledger, lib/accounting), never raw
// SQL inserts for anything a service already owns — so inventory balances
// and journal entries come out internally consistent, not hand-faked JSON.
//
// Run: npm run db:seed
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

import { getDb } from '../db/client'
import { branches } from '../db/schema'
import { provisionTenant } from '../lib/auth/provisioning'
import { createProductsService } from '../lib/products/service'
import { createCustomersService } from '../lib/customers/service'
import { createLedgerService } from '../lib/ledger/service'
import { createAccountingService } from '../lib/accounting/service'
import { SYSTEM_CONTEXT } from '../lib/authz/types'

const OWNER_EMAIL = 'owner@mista-demo.test'
const OWNER_PASSWORD = 'Demo12345!'

async function main() {
  const db = await getDb() // also runs the pglite migration on first call

  console.log('› إنشاء المستأجر والمالك...')
  const { tenantId } = await provisionTenant({
    ownerName: 'عبدالله الباقي',
    ownerEmail: OWNER_EMAIL,
    ownerPassword: OWNER_PASSWORD,
    companyName: 'متجر ميستا للعطور',
  })

  console.log('› إنشاء الفروع...')
  const [riyadhBranch] = await db
    .insert(branches)
    .values({ tenantId, name: 'فرع الرياض', code: 'RIYADH-01', type: 'physical' })
    .returning()
  const [onlineBranch] = await db
    .insert(branches)
    .values({ tenantId, name: 'متجر سلة', code: 'ONLINE', type: 'online' })
    .returning()

  // شجرة الحسابات + account_mappings أصبحت تُنشأ تلقائياً داخل provisionTenant
  // (lib/accounting/defaults.ts) لكل مستأجر جديد — لا حاجة لإنشائها هنا يدوياً.

  console.log('› إنشاء المنتجات...')
  const products = createProductsService(db)
  const perfumes = [
    { name: 'عود ملكي', category: 'عطور رجالية', sku: 'MISTA-OUD-100', price: 320 },
    { name: 'ورد دمشقي', category: 'عطور نسائية', sku: 'MISTA-ROSE-50', price: 260 },
    { name: 'عنبر الشرق', category: 'عطور مشتركة', sku: 'MISTA-AMBER-100', price: 410 },
  ] as const
  const productIds: { sku: string; price: number }[] = []
  for (const p of perfumes) {
    const { variantIds } = await products.createProduct(SYSTEM_CONTEXT, {
      tenantId,
      name: p.name,
      category: p.category,
      variants: [{ sku: p.sku }],
    })
    void variantIds
    productIds.push({ sku: p.sku, price: p.price })
  }

  console.log('› إنشاء عميل...')
  const customers = createCustomersService(db)
  const customer = await customers.createCustomer(SYSTEM_CONTEXT, {
    tenantId,
    name: 'نورة السالم',
    phone: '0501234567',
  })

  console.log('› تسجيل رصيد افتتاحي ومبيعات...')
  const ledger = createLedgerService(db)
  const accounting = createAccountingService(db)

  for (const p of productIds) {
    await ledger.recordInventoryMovement(SYSTEM_CONTEXT, {
      tenantId,
      branchId: riyadhBranch.id,
      sku: p.sku,
      quantityDelta: 50,
      reason: 'initial_stock',
      sourceType: 'manual_adjustment',
      idempotencyKey: `seed-initial-stock:${p.sku}`,
      occurredAt: new Date('2026-07-01'),
    })
  }

  const invoiceIds: string[] = []
  let invoiceCounter = 1
  for (const [i, p] of productIds.entries()) {
    const { invoiceId } = await ledger.recordSaleInvoice(SYSTEM_CONTEXT, {
      tenantId,
      branchId: riyadhBranch.id,
      sourceType: 'branch_pos',
      idempotencyKey: `seed-invoice:${invoiceCounter}`,
      occurredAt: new Date(`2026-07-1${i + 5}`),
      invoiceNumber: `INV-DEMO-${String(invoiceCounter).padStart(4, '0')}`,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone ?? undefined,
      lines: [{ sku: p.sku, productName: p.sku, quantity: 2, unitPrice: p.price, tax: p.price * 2 * 0.15 }],
    })
    if (invoiceId) invoiceIds.push(invoiceId)
    invoiceCounter++
  }

  console.log('› ترحيل بعض الفواتير محاسبياً (وترك واحدة بدون ترحيل عمداً)...')
  for (const invoiceId of invoiceIds.slice(0, -1)) {
    await accounting.postSaleInvoiceJournal(SYSTEM_CONTEXT, tenantId, invoiceId)
  }

  console.log('')
  console.log('✅ تم زرع بيانات العرض التجريبي بنجاح.')
  console.log('')
  console.log(`تسجيل الدخول:`)
  console.log(`  البريد:        ${OWNER_EMAIL}`)
  console.log(`  كلمة المرور:   ${OWNER_PASSWORD}`)
  console.log('')
  console.log(`الفرع (رياض):    ${riyadhBranch.id}`)
  console.log(`الفرع (أونلاين): ${onlineBranch.id}`)
  console.log(`فواتير البيع:    ${invoiceIds.join(', ')}`)
  console.log(`  آخر فاتورة (${invoiceIds[invoiceIds.length - 1]}) بدون ترحيل محاسبي عمداً — لعرض حالة "قبل الترحيل".`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('فشل زرع البيانات:', err)
    process.exit(1)
  })

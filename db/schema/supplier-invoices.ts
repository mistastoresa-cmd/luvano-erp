import { pgTable, uuid, text, numeric, date, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { suppliers } from './suppliers'
import { purchaseOrders } from './purchase-orders'
import { journalEntries } from './journal-entries'

// فاتورة المورّد — الطرف المقابل لـsale_invoices على جانب المشتريات (ذمم
// دائنة/Accounts Payable بدل ذمم مدينة/Accounts Receivable). journalEntryId
// اختياري: يُملأ لاحقاً عند ترحيل الفاتورة محاسبياً (منطق تطبيق مستقبلي).
export const supplierInvoices = pgTable(
  'supplier_invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id),
    // رقم الفاتورة الداخلي بلوفانو.
    invoiceNumber: text('invoice_number').notNull(),
    // رقم فاتورة المورّد نفسه (يظهر على مستنده الورقي/الرقمي) — مختلف عن
    // invoiceNumber أعلاه، يُحفظ للمطابقة عند المراجعة.
    supplierInvoiceNumber: text('supplier_invoice_number'),
    invoiceDate: date('invoice_date').notNull(),
    dueDate: date('due_date'),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
    taxTotal: numeric('tax_total', { precision: 12, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 12, scale: 2 }).notNull(),
    status: text('status', {
      enum: ['unpaid', 'partially_paid', 'paid', 'void'],
    })
      .notNull()
      .default('unpaid'),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('supplier_invoices_tenant_invoice_number_idx').on(
      table.tenantId,
      table.invoiceNumber
    ),
  ]
)

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq, and, desc } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { supplierPayments, suppliers, bankAccounts, branches } from '@/db/schema'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/app-shell/page-header'
import { SupplierPaymentDialog, PostPaymentButton } from './payment-dialog'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from '@/components/ui/table'

const METHOD_LABELS: Record<string, string> = {
  cash: 'نقدي',
  bank_transfer: 'تحويل بنكي',
  card: 'بطاقة',
  cheque: 'شيك',
}

function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('ar-SA-u-nu-latn', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default async function SupplierPaymentsPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId } = session

  const db = await getDb()
  const [rows, supplierRows, banks, branchRows] = await Promise.all([
    db
      .select({
        id: supplierPayments.id,
        amount: supplierPayments.amount,
        date: supplierPayments.paymentDate,
        method: supplierPayments.method,
        reference: supplierPayments.reference,
        chequeNumber: supplierPayments.chequeNumber,
        journalEntryId: supplierPayments.journalEntryId,
        supplierName: suppliers.name,
      })
      .from(supplierPayments)
      .innerJoin(suppliers, eq(supplierPayments.supplierId, suppliers.id))
      .where(eq(supplierPayments.tenantId, tenantId))
      .orderBy(desc(supplierPayments.paymentDate))
      .limit(200),
    db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.tenantId, tenantId))
      .orderBy(suppliers.name),
    db
      .select({
        id: bankAccounts.id,
        bankName: bankAccounts.bankName,
        accountNumber: bankAccounts.accountNumber,
      })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.tenantId, tenantId), eq(bankAccounts.isActive, true)))
      .orderBy(bankAccounts.bankName),
    db
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(eq(branches.tenantId, tenantId))
      .orderBy(branches.name),
  ])

  const total = rows.reduce((s, r) => s + Number(r.amount), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="دفعات الموردين"
        subtitle="سداد المستحقات نقداً أو بتحويل بنكي أو بشيك — ويُخصم من حساب البنك المحدد"
        action={
          <SupplierPaymentDialog
            suppliers={supplierRows}
            banks={banks.map((b) => ({
              id: b.id,
              label: b.accountNumber ? `${b.bankName} · ${b.accountNumber}` : b.bankName,
            }))}
            branches={branchRows}
          />
        }
      />

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>المورد</TableHeaderCell>
              <TableHeaderCell>طريقة الدفع</TableHeaderCell>
              <TableHeaderCell>المرجع</TableHeaderCell>
              <TableHeaderCell>التاريخ</TableHeaderCell>
              <TableHeaderCell className="text-end">المبلغ</TableHeaderCell>
              <TableHeaderCell>الترحيل</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.supplierName}</TableCell>
                <TableCell>
                  <Badge variant="neutral">{METHOD_LABELS[r.method] ?? r.method}</Badge>
                </TableCell>
                <TableCell className="tabular-figures text-xs text-[color:var(--text-tertiary)]">
                  {r.chequeNumber ? `شيك ${r.chequeNumber}` : (r.reference ?? '—')}
                </TableCell>
                <TableCell>{fmtDate(r.date)}</TableCell>
                <TableCell className="tabular-figures text-end font-medium">
                  {money(Number(r.amount))}
                </TableCell>
                <TableCell>
                  {r.journalEntryId ? (
                    <Badge variant="success">مُرحَّل</Badge>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Badge variant="warning">غير مُرحَّل</Badge>
                      <PostPaymentButton paymentId={r.id} />
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-[color:var(--text-tertiary)]">
                  لا توجد دفعات بعد.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {rows.length > 0 && (
          <div className="flex items-center justify-between border-t border-[color:var(--border-subtle)] px-4 py-3 text-sm">
            <span className="text-[color:var(--text-secondary)]">إجمالي المدفوع</span>
            <span className="tabular-figures font-bold">{money(total)} ر.س</span>
          </div>
        )}
      </Card>
    </div>
  )
}

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq, and, desc } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { hasBranchAccess } from '@/lib/authz/types'
import { expenses, chartOfAccounts, bankAccounts, branches } from '@/db/schema'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/ui/stat-card'
import { PageHeader } from '@/components/app-shell/page-header'
import { ExpenseDialog, PostExpenseButton } from './expense-dialog'
import { Receipt, Clock } from '@phosphor-icons/react/dist/ssr'
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
  bank: 'بنكي',
  cheque: 'شيك',
  credit: 'آجل',
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

export default async function ExpensesPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId, context } = session

  const db = await getDb()
  const [rows, expenseAccounts, banks, branchRows] = await Promise.all([
    db
      .select({
        id: expenses.id,
        number: expenses.expenseNumber,
        date: expenses.expenseDate,
        amount: expenses.amount,
        tax: expenses.taxAmount,
        method: expenses.paymentMethod,
        status: expenses.status,
        description: expenses.description,
        beneficiary: expenses.beneficiary,
        branchId: expenses.branchId,
        accountCode: chartOfAccounts.code,
        accountName: chartOfAccounts.name,
      })
      .from(expenses)
      .innerJoin(chartOfAccounts, eq(expenses.expenseAccountId, chartOfAccounts.id))
      .where(eq(expenses.tenantId, tenantId))
      .orderBy(desc(expenses.expenseDate))
      .limit(200),
    db
      .select({ id: chartOfAccounts.id, code: chartOfAccounts.code, name: chartOfAccounts.name })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.tenantId, tenantId), eq(chartOfAccounts.type, 'expense')))
      .orderBy(chartOfAccounts.code),
    db
      .select({ id: bankAccounts.id, bankName: bankAccounts.bankName, accountNumber: bankAccounts.accountNumber })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.tenantId, tenantId), eq(bankAccounts.isActive, true)))
      .orderBy(bankAccounts.bankName),
    db
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(eq(branches.tenantId, tenantId))
      .orderBy(branches.name),
  ])

  // Central expenses (no branch) are visible to everyone; branch ones follow
  // the caller's branch access.
  const visible = rows.filter((r) => !r.branchId || hasBranchAccess(context.branchAccess, r.branchId))
  const total = visible.reduce((s, r) => s + Number(r.amount) + Number(r.tax), 0)
  const unposted = visible.filter((r) => r.status === 'draft')

  return (
    <div className="space-y-6">
      <PageHeader
        title="المصروفات"
        subtitle="تسجيل المصروفات وترحيلها محاسبياً على حسابات الشجرة"
        action={
          <ExpenseDialog
            expenseAccounts={expenseAccounts.map((a) => ({ id: a.id, label: `${a.code} · ${a.name}` }))}
            banks={banks.map((b) => ({
              id: b.id,
              label: b.accountNumber ? `${b.bankName} · ${b.accountNumber}` : b.bankName,
            }))}
            branches={branchRows}
          />
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="إجمالي المصروفات"
          value={money(total)}
          suffix="ر.س"
          tint="rose"
          icon={<Receipt size={20} weight="bold" />}
        />
        <StatCard
          title="بانتظار الترحيل"
          value={String(unposted.length)}
          tone={unposted.length > 0 ? 'danger' : 'neutral'}
          tint="amber"
          icon={<Clock size={20} weight="bold" />}
        />
        <StatCard
          title="عدد المصروفات"
          value={String(visible.length)}
          tint="teal"
          icon={<Receipt size={20} weight="bold" />}
        />
      </div>

      {expenseAccounts.length === 0 && (
        <Card>
          <CardContent className="py-4 text-sm text-[color:var(--text-tertiary)]">
            لا توجد حسابات مصروفات في الشجرة بعد — أضف حساباً بنوع «مصروفات» من قسم المحاسبة.
          </CardContent>
        </Card>
      )}

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>الرقم</TableHeaderCell>
              <TableHeaderCell>الحساب / البيان</TableHeaderCell>
              <TableHeaderCell>طريقة الدفع</TableHeaderCell>
              <TableHeaderCell>التاريخ</TableHeaderCell>
              <TableHeaderCell className="text-end">المبلغ</TableHeaderCell>
              <TableHeaderCell>الحالة</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.number}</TableCell>
                <TableCell>
                  <div className="text-sm">
                    {r.accountCode} · {r.accountName}
                  </div>
                  {(r.description || r.beneficiary) && (
                    <div className="text-[11px] text-[color:var(--text-tertiary)]">
                      {[r.beneficiary, r.description].filter(Boolean).join(' — ')}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="neutral">{METHOD_LABELS[r.method] ?? r.method}</Badge>
                </TableCell>
                <TableCell>{fmtDate(r.date)}</TableCell>
                <TableCell className="tabular-figures text-end">
                  {money(Number(r.amount) + Number(r.tax))}
                </TableCell>
                <TableCell>
                  {r.status === 'posted' ? (
                    <Badge variant="success">مُرحَّل</Badge>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Badge variant="warning">مسودة</Badge>
                      <PostExpenseButton expenseId={r.id} />
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-[color:var(--text-tertiary)]">
                  لا توجد مصروفات بعد.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

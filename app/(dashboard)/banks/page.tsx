import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq, and } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { bankAccounts, chartOfAccounts } from '@/db/schema'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/app-shell/page-header'
import { AddResourceDialog } from '@/components/forms/resource-form'
import { createBankAccountAction } from './actions'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from '@/components/ui/table'

export default async function BanksPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId, context } = session

  const db = await getDb()
  const [rows, assetAccounts] = await Promise.all([
    db
      .select({
        id: bankAccounts.id,
        bankName: bankAccounts.bankName,
        accountName: bankAccounts.accountName,
        accountNumber: bankAccounts.accountNumber,
        iban: bankAccounts.iban,
        currency: bankAccounts.currency,
        isActive: bankAccounts.isActive,
        chartCode: chartOfAccounts.code,
        chartName: chartOfAccounts.name,
      })
      .from(bankAccounts)
      .innerJoin(chartOfAccounts, eq(bankAccounts.chartAccountId, chartOfAccounts.id))
      .where(eq(bankAccounts.tenantId, tenantId))
      .orderBy(bankAccounts.bankName),
    db
      .select({ id: chartOfAccounts.id, code: chartOfAccounts.code, name: chartOfAccounts.name })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.tenantId, tenantId), eq(chartOfAccounts.type, 'asset')))
      .orderBy(chartOfAccounts.code),
  ])

  const canManage = context.role === 'owner' || context.role === 'accountant'

  return (
    <div className="space-y-6">
      <PageHeader
        title="البنوك"
        subtitle="حسابات البنوك وبياناتها، وكل حساب مربوط بحساب أصل في شجرة الحسابات"
        action={
          canManage ? (
            <AddResourceDialog
              title="إضافة حساب بنكي"
              triggerLabel="إضافة بنك"
              action={createBankAccountAction}
              fields={[
                { name: 'bankName', label: 'اسم البنك', required: true, placeholder: 'الراجحي' },
                { name: 'accountName', label: 'اسم الحساب' },
                { name: 'accountNumber', label: 'رقم الحساب' },
                { name: 'iban', label: 'الآيبان', placeholder: 'SA00...' },
                { name: 'swift', label: 'السويفت' },
                { name: 'currency', label: 'العملة', defaultValue: 'SAR' },
                {
                  name: 'chartAccountId',
                  label: 'حساب الشجرة (اختر موجوداً)',
                  type: 'select',
                  options: assetAccounts.map((a) => ({
                    value: a.id,
                    label: `${a.code} · ${a.name}`,
                  })),
                },
                {
                  name: 'newAccountCode',
                  label: 'أو رمز حساب جديد يُنشأ تلقائياً',
                  placeholder: '1010',
                },
                { name: 'notes', label: 'ملاحظات' },
              ]}
            />
          ) : undefined
        }
      />

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>البنك</TableHeaderCell>
              <TableHeaderCell>رقم الحساب / الآيبان</TableHeaderCell>
              <TableHeaderCell>حساب الشجرة</TableHeaderCell>
              <TableHeaderCell>العملة</TableHeaderCell>
              <TableHeaderCell>الحالة</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  <div className="font-medium">{b.bankName}</div>
                  {b.accountName && (
                    <div className="text-[11px] text-[color:var(--text-tertiary)]">{b.accountName}</div>
                  )}
                </TableCell>
                <TableCell className="tabular-figures">
                  <div>{b.accountNumber ?? '—'}</div>
                  {b.iban && (
                    <div className="font-mono text-[11px] text-[color:var(--text-tertiary)]">{b.iban}</div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="accent">
                    {b.chartCode} · {b.chartName}
                  </Badge>
                </TableCell>
                <TableCell>{b.currency}</TableCell>
                <TableCell>
                  <Badge variant={b.isActive ? 'success' : 'neutral'}>
                    {b.isActive ? 'نشط' : 'متوقّف'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-[color:var(--text-tertiary)]">
                  لا توجد حسابات بنكية بعد — أضف بنكاً لتتمكن من الدفع بنكياً أو بشيك.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

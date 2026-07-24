import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq, and, desc } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { chartOfAccounts, journalEntries } from '@/db/schema'
import Link from 'next/link'
import { Plus } from '@phosphor-icons/react/dist/ssr'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app-shell/page-header'
import { ChartToolbar } from './chart-toolbar'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from '@/components/ui/table'

const TYPE_LABELS: Record<string, string> = {
  asset: 'أصول',
  liability: 'خصوم',
  equity: 'حقوق ملكية',
  revenue: 'إيرادات',
  expense: 'مصروفات',
}
const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  posted: 'مُرحَّل',
  voided: 'ملغى',
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default async function AccountingPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId } = session

  const db = await getDb()
  const [accounts, entries] = await Promise.all([
    db
      .select()
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.tenantId, tenantId))
      .orderBy(chartOfAccounts.code),
    db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.tenantId, tenantId))
      .orderBy(desc(journalEntries.entryDate))
      .limit(50),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="المحاسبة"
        subtitle="شجرة الحسابات والقيود المحاسبية"
        action={
          <Link href="/accounting/journal/new">
            <Button>
              <Plus size={16} weight="bold" />
              قيد يدوي
            </Button>
          </Link>
        }
      />

      <ChartToolbar />

      <Card>
        <CardHeader>
          <CardTitle>
            شجرة الحسابات ({accounts.length}) — منها{' '}
            {accounts.filter((a) => a.type === 'expense').length} حساب مصروفات
          </CardTitle>
        </CardHeader>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>الرمز</TableHeaderCell>
              <TableHeaderCell>الحساب</TableHeaderCell>
              <TableHeaderCell>النوع</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {accounts.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="tabular-figures font-mono text-xs">{a.code}</TableCell>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell>
                  <Badge variant="neutral">{TYPE_LABELS[a.type] ?? a.type}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>آخر القيود المحاسبية</CardTitle>
        </CardHeader>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>رقم القيد</TableHeaderCell>
              <TableHeaderCell>الوصف</TableHeaderCell>
              <TableHeaderCell>الحالة</TableHeaderCell>
              <TableHeaderCell>التاريخ</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.entryNumber}</TableCell>
                <TableCell className="text-[color:var(--text-secondary)]">{e.description ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={e.status === 'posted' ? 'success' : e.status === 'voided' ? 'danger' : 'neutral'}>
                    {STATUS_LABELS[e.status] ?? e.status}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(e.entryDate)}</TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-[color:var(--text-tertiary)]">
                  لا توجد قيود محاسبية بعد.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

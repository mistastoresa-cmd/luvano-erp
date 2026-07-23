import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { CaretLeft } from '@phosphor-icons/react/dist/ssr'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { accountMappings, chartOfAccounts } from '@/db/schema'
import { Card, CardContent } from '@/components/ui/card'
import { JournalEntryForm } from './journal-form'

export default async function NewJournalEntryPage() {
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId } = session

  const db = await getDb()
  // Only mapped accounts are selectable — postJournalEntry resolves lines by
  // account *key*, so an unmapped chart account can't be posted to.
  const rows = await db
    .select({
      key: accountMappings.key,
      code: chartOfAccounts.code,
      name: chartOfAccounts.name,
    })
    .from(accountMappings)
    .innerJoin(chartOfAccounts, eq(accountMappings.accountId, chartOfAccounts.id))
    .where(eq(accountMappings.tenantId, tenantId))
    .orderBy(chartOfAccounts.code)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 text-sm text-[color:var(--text-tertiary)]">
        <Link href="/accounting" className="hover:text-accent-600">
          المحاسبة
        </Link>
        <CaretLeft size={13} />
        <span className="text-[color:var(--text-secondary)]">قيد يدوي جديد</span>
      </div>

      <div>
        <h1 className="text-xl font-bold text-[color:var(--text-primary)]">قيد محاسبي يدوي</h1>
        <p className="mt-1 text-sm text-[color:var(--text-tertiary)]">
          أضف بنود القيد — لا يُرحَّل إلا إذا تساوى المدين مع الدائن
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-[color:var(--text-tertiary)]">
            لا توجد حسابات مربوطة بعد.
          </CardContent>
        </Card>
      ) : (
        <JournalEntryForm
          accounts={rows.map((r) => ({ key: r.key, label: `${r.code} · ${r.name}` }))}
        />
      )}
    </div>
  )
}

import { headers } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { getDb } from '@/db/client'
import { resolveDashboardSession } from '@/lib/authz/session'
import { createDocumentFlowService } from '@/lib/document-flow/service'
import { ForbiddenError } from '@/lib/authz/errors'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  FileText,
  Package,
  BookOpen,
  CheckCircle,
  Circle,
} from '@phosphor-icons/react/dist/ssr'

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDateTime(d: Date): string {
  return new Date(d).toLocaleString('ar-SA-u-nu-latn', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const SOURCE_LABELS: Record<string, string> = {
  salla_order: 'سلة',
  branch_pos: 'نقطة بيع',
  branch_offline: 'غير متصل',
}

// A vertical connector node — the visual language for "document A produced
// document B", reused at each stage of the flow (invoice -> movement ->
// journal) so the pipeline reads as one continuous chain regardless of how
// many lines/movements/journal lines it fans out to.
function TimelineNode({
  icon,
  title,
  subtitle,
  tone = 'accent',
  isLast = false,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  tone?: 'accent' | 'success' | 'warning'
  isLast?: boolean
  children?: React.ReactNode
}) {
  const toneClasses = {
    accent: 'bg-accent-500/12 text-accent-600',
    success: 'bg-success-500/12 text-success-600',
    warning: 'bg-warning-500/14 text-warning-600',
  }[tone]

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-full ${toneClasses}`}>
          {icon}
        </div>
        {!isLast && <div className="w-px flex-1 bg-[color:var(--border-default)]" />}
      </div>
      <div className={`flex-1 ${isLast ? '' : 'pb-8'}`}>
        <p className="text-sm font-medium text-[color:var(--text-primary)]">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-[color:var(--text-tertiary)]">{subtitle}</p>}
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  )
}

export default async function SaleInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')
  const { tenantId, context } = session

  const db = await getDb()
  const documentFlow = createDocumentFlowService(db)

  let flow
  try {
    flow = await documentFlow.getSaleInvoiceDocumentFlow(context, tenantId, id)
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return (
        <Card>
          <CardContent className="py-6 text-sm text-[color:var(--text-tertiary)]">
            لا تملك صلاحية عرض هذه الفاتورة.
          </CardContent>
        </Card>
      )
    }
    notFound()
  }

  const { invoice, lines, journalEntry } = flow

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-[color:var(--text-primary)]">
            فاتورة {invoice.invoiceNumber}
          </h1>
          <p className="mt-1 text-sm text-[color:var(--text-tertiary)]">
            {SOURCE_LABELS[invoice.sourceType] ?? invoice.sourceType} · {formatDateTime(invoice.occurredAt)}
            {invoice.customerName ? ` · ${invoice.customerName}` : ''}
          </p>
        </div>
        <div className="tabular-figures text-end">
          <p className="text-2xl font-semibold text-[color:var(--text-primary)]">
            {formatCurrency(invoice.total)} ر.س
          </p>
          <Badge variant={journalEntry ? 'success' : 'warning'} className="mt-1">
            {journalEntry ? 'مُرحَّل محاسبياً' : 'بانتظار الترحيل'}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>الدورة المستندية</CardTitle>
        </CardHeader>
        <CardContent>
          <TimelineNode
            icon={<FileText size={18} weight="bold" />}
            title={`إنشاء الفاتورة ${invoice.invoiceNumber}`}
            subtitle={`${lines.length} صنف · إجمالي ${formatCurrency(invoice.total)} ر.س`}
          />

          {lines.map((line, i) => (
            <TimelineNode
              key={line.id}
              icon={<Package size={18} weight="bold" />}
              title={`حركة مخزون — ${line.productName}`}
              subtitle={`SKU: ${line.sku} · الكمية: ${line.quantity} × ${formatCurrency(line.unitPrice)} ر.س`}
            >
              {line.movement ? (
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="accent" className="tabular-figures">
                    {line.movement.quantityDelta > 0 ? '+' : ''}
                    {line.movement.quantityDelta} وحدة
                  </Badge>
                  <span className="text-[color:var(--text-tertiary)]">
                    {formatDateTime(line.movement.occurredAt)}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-[color:var(--text-tertiary)]">
                  لا توجد حركة مخزون مرتبطة بهذا السطر.
                </p>
              )}
            </TimelineNode>
          ))}

          <TimelineNode
            icon={
              journalEntry ? (
                <CheckCircle size={18} weight="bold" />
              ) : (
                <Circle size={18} weight="bold" />
              )
            }
            title={journalEntry ? `القيد المحاسبي ${journalEntry.entryNumber}` : 'لم يُرحَّل محاسبياً بعد'}
            subtitle={
              journalEntry
                ? formatDateTime(journalEntry.entryDate)
                : 'هذه الفاتورة لم تُولِّد قيداً محاسبياً حتى الآن'
            }
            tone={journalEntry ? 'success' : 'warning'}
            isLast
          >
            {journalEntry && (
              <div className="overflow-hidden rounded-lg border border-[color:var(--border-subtle)]">
                <table className="w-full text-xs">
                  <thead className="border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)]">
                    <tr>
                      <th className="px-3 py-2 text-start font-medium text-[color:var(--text-tertiary)]">
                        الحساب
                      </th>
                      <th className="px-3 py-2 text-end font-medium text-[color:var(--text-tertiary)]">
                        مدين
                      </th>
                      <th className="px-3 py-2 text-end font-medium text-[color:var(--text-tertiary)]">
                        دائن
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--border-subtle)]">
                    {journalEntry.lines.map((l) => (
                      <tr key={l.accountId}>
                        <td className="px-3 py-2 text-[color:var(--text-primary)]">
                          {l.accountCode} · {l.accountName}
                        </td>
                        <td className="tabular-figures px-3 py-2 text-end">
                          {l.debit > 0 ? formatCurrency(l.debit) : '—'}
                        </td>
                        <td className="tabular-figures px-3 py-2 text-end">
                          {l.credit > 0 ? formatCurrency(l.credit) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TimelineNode>
        </CardContent>
      </Card>
    </div>
  )
}

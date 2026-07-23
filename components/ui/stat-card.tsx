import type { ReactNode } from 'react'
import { Card } from './card'
import { cn } from './utils'

// Soft tinted chips behind the icon — each KPI reads as its own thing at a
// glance instead of four identical gray boxes. Tints are icon-only; they
// never become the value colour (that stays semantic: profit/loss).
const TINTS = {
  accent: 'bg-accent-500/12 text-accent-600',
  teal: 'bg-[color:var(--color-tint-teal)]/12 text-[color:var(--color-tint-teal)]',
  violet: 'bg-[color:var(--color-tint-violet)]/12 text-[color:var(--color-tint-violet)]',
  amber: 'bg-[color:var(--color-tint-amber)]/16 text-[color:var(--color-tint-amber)]',
  rose: 'bg-[color:var(--color-tint-rose)]/12 text-[color:var(--color-tint-rose)]',
  sky: 'bg-[color:var(--color-tint-sky)]/12 text-[color:var(--color-tint-sky)]',
} as const

export function StatCard({
  title,
  value,
  suffix,
  tone = 'neutral',
  tint = 'accent',
  icon,
}: {
  title: string
  value: string
  suffix?: string
  tone?: 'neutral' | 'success' | 'danger'
  tint?: keyof typeof TINTS
  icon?: ReactNode
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[color:var(--text-tertiary)]">{title}</p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span
              className={cn(
                'tabular-figures text-[26px] font-bold leading-none',
                tone === 'success' && 'text-success-600',
                tone === 'danger' && 'text-danger-600',
                tone === 'neutral' && 'text-[color:var(--text-primary)]'
              )}
            >
              {value}
            </span>
            {suffix && (
              <span className="text-xs text-[color:var(--text-tertiary)]">{suffix}</span>
            )}
          </div>
        </div>
        {icon && (
          <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', TINTS[tint])}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  )
}

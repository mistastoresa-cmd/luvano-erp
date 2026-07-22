import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './card'
import { cn } from './utils'

export function StatCard({
  title,
  value,
  suffix,
  tone = 'neutral',
  icon,
}: {
  title: string
  value: string
  suffix?: string
  tone?: 'neutral' | 'success' | 'danger'
  icon?: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              'tabular-figures text-2xl font-semibold',
              tone === 'success' && 'text-success-600',
              tone === 'danger' && 'text-danger-600',
              tone === 'neutral' && 'text-[color:var(--text-primary)]'
            )}
          >
            {value}
          </span>
          {suffix && <span className="text-xs text-[color:var(--text-tertiary)]">{suffix}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

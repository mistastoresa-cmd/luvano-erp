import type { ReactNode } from 'react'

// Standard page header: title + subtitle on the start side, an optional
// action (usually an add-dialog trigger) on the end side.
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-lg font-semibold text-[color:var(--text-primary)]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-[color:var(--text-tertiary)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

import Link from 'next/link'

const TABS = [
  { key: 'employees', label: 'الموظفون', href: '/hr' },
  { key: 'leave', label: 'الإجازات', href: '/hr/leave' },
  { key: 'payroll', label: 'الرواتب', href: '/hr/payroll' },
  { key: 'tasks', label: 'المهام', href: '/hr/tasks' },
] as const

export type HrTab = (typeof TABS)[number]['key']

export function HrTabs({ active }: { active: HrTab }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-[color:var(--border-subtle)]">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-medium transition-colors ${
            active === t.key
              ? 'border-accent-600 text-accent-600'
              : 'border-transparent text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)]'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}

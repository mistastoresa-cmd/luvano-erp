import Link from 'next/link'

const TABS = [
  { key: 'coupons', label: 'الكوبونات', href: '/marketing' },
  { key: 'offers', label: 'العروض الخاصة', href: '/marketing/offers' },
] as const

// Sub-navigation for the marketing module. More sections (عروض البنك، الكاش
// باك، الجدول الزمني) will be added here as they're built.
export function MarketingTabs({ active }: { active: 'coupons' | 'offers' }) {
  return (
    <div className="flex gap-1 border-b border-[color:var(--border-subtle)]">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors ${
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

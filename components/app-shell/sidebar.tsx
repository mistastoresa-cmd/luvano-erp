'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  SquaresFour,
  Receipt,
  Package,
  ShoppingCart,
  Calculator,
  Users,
  Megaphone,
  UsersThree,
} from '@phosphor-icons/react'
import { cn } from '@/components/ui/utils'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'لوحة التحكم', icon: SquaresFour },
  { href: '/sales', label: 'المبيعات', icon: Receipt },
  { href: '/inventory', label: 'المخزون', icon: Package },
] as const

const COMING_SOON_ITEMS = [
  { label: 'المشتريات', icon: ShoppingCart },
  { label: 'المحاسبة', icon: Calculator },
  { label: 'العملاء', icon: Users },
  { label: 'التسويق والعروض', icon: Megaphone },
  { label: 'الموارد البشرية', icon: UsersThree },
] as const

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-[100dvh] w-60 shrink-0 flex-col border-e border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]">
      <div className="flex h-16 items-center gap-2 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-600 text-sm font-bold text-white">
          ل
        </div>
        <span className="text-sm font-semibold text-[color:var(--text-primary)]">لوفانو ERP</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-accent-500/10 text-accent-600'
                  : 'text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-sunken)]'
              )}
            >
              <Icon size={18} weight={active ? 'fill' : 'regular'} />
              {item.label}
            </Link>
          )
        })}

        <div className="mt-4 mb-1 px-3 text-[11px] font-medium text-[color:var(--text-tertiary)]">
          قريباً
        </div>
        {COMING_SOON_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <div
              key={item.label}
              className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[color:var(--text-tertiary)] opacity-60"
            >
              <Icon size={18} />
              {item.label}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}

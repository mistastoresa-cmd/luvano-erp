'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  SquaresFour,
  Receipt,
  Package,
  ArrowsLeftRight,
  Tag,
  ShoppingCart,
  Truck,
  Calculator,
  Users,
  Megaphone,
  UsersThree,
  Buildings,
} from '@phosphor-icons/react'
import { cn } from '@/components/ui/utils'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'لوحة التحكم', icon: SquaresFour },
  { href: '/sales', label: 'المبيعات', icon: Receipt },
  { href: '/inventory', label: 'المخزون', icon: Package },
  { href: '/transfers', label: 'تحويلات المخزون', icon: ArrowsLeftRight },
  { href: '/products', label: 'المنتجات', icon: Tag },
  { href: '/purchasing', label: 'المشتريات', icon: ShoppingCart },
  { href: '/suppliers', label: 'الموردون', icon: Truck },
  { href: '/accounting', label: 'المحاسبة', icon: Calculator },
  { href: '/customers', label: 'العملاء', icon: Users },
  { href: '/marketing', label: 'التسويق والعروض', icon: Megaphone },
  { href: '/hr', label: 'الموارد البشرية', icon: UsersThree },
  { href: '/branches', label: 'الفروع', icon: Buildings },
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
                'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                active
                  ? 'bg-accent-600 text-white shadow-sm shadow-accent-600/20'
                  : 'text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-sunken)] hover:text-[color:var(--text-primary)]'
              )}
            >
              <Icon size={18} weight={active ? 'fill' : 'regular'} />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

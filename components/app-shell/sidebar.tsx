'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  SquaresFour,
  Receipt,
  Package,
  ArrowsLeftRight,
  Tag,
  ShoppingCart,
  Truck,
  Calculator,
  Bank,
  Users,
  Megaphone,
  UsersThree,
  Buildings,
  Storefront,
  Books,
  CaretDown,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react'
import { cn } from '@/components/ui/utils'

interface NavLeaf {
  href: string
  label: string
  icon: PhosphorIcon
}
interface NavGroup {
  key: string
  label: string
  icon: PhosphorIcon
  children: NavLeaf[]
}
type NavEntry = NavLeaf | NavGroup

function isGroup(e: NavEntry): e is NavGroup {
  return 'children' in e
}

// Grouped by business function rather than one flat list — accounting-side
// screens (chart, expenses, banks) live under one parent, same for the
// sales/inventory/purchasing sides, so the sidebar stays readable as modules
// keep landing.
const NAV: NavEntry[] = [
  { href: '/dashboard', label: 'لوحة التحكم', icon: SquaresFour },
  {
    key: 'sales',
    label: 'المبيعات',
    icon: Storefront,
    children: [
      { href: '/sales', label: 'فواتير البيع', icon: Receipt },
      { href: '/customers', label: 'العملاء', icon: Users },
      { href: '/marketing', label: 'التسويق والعروض', icon: Megaphone },
    ],
  },
  {
    key: 'inventory',
    label: 'المخزون',
    icon: Package,
    children: [
      { href: '/inventory', label: 'الأرصدة', icon: Package },
      { href: '/products', label: 'المنتجات', icon: Tag },
      { href: '/transfers', label: 'التحويلات', icon: ArrowsLeftRight },
    ],
  },
  {
    key: 'purchasing',
    label: 'المشتريات',
    icon: ShoppingCart,
    children: [
      { href: '/purchasing', label: 'أوامر الشراء', icon: ShoppingCart },
      { href: '/suppliers', label: 'الموردون', icon: Truck },
    ],
  },
  {
    key: 'accounting',
    label: 'المحاسبة',
    icon: Calculator,
    children: [
      { href: '/accounting', label: 'شجرة الحسابات والقيود', icon: Books },
      { href: '/expenses', label: 'المصروفات', icon: Receipt },
      { href: '/banks', label: 'البنوك', icon: Bank },
    ],
  },
  { href: '/hr', label: 'الموارد البشرية', icon: UsersThree },
  { href: '/branches', label: 'الفروع', icon: Buildings },
]

function leafActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/')
}

export function Sidebar() {
  const pathname = usePathname()

  // A group starts open when the current route lives inside it, and the user
  // can toggle from there.
  const [manual, setManual] = useState<Record<string, boolean>>({})
  function groupOpen(g: NavGroup): boolean {
    if (g.key in manual) return manual[g.key]
    return g.children.some((c) => leafActive(pathname, c.href))
  }

  return (
    <aside className="flex h-[100dvh] w-60 shrink-0 flex-col border-e border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]">
      <div className="flex h-16 items-center gap-2 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-600 text-sm font-bold text-white">
          ل
        </div>
        <span className="text-sm font-semibold text-[color:var(--text-primary)]">لوفانو ERP</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {NAV.map((entry) => {
          if (!isGroup(entry)) {
            const active = leafActive(pathname, entry.href)
            const Icon = entry.icon
            return (
              <Link
                key={entry.href}
                href={entry.href}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                  active
                    ? 'bg-accent-600 text-white shadow-sm shadow-accent-600/20'
                    : 'text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-sunken)] hover:text-[color:var(--text-primary)]'
                )}
              >
                <Icon size={18} weight={active ? 'fill' : 'regular'} />
                {entry.label}
              </Link>
            )
          }

          const open = groupOpen(entry)
          const hasActiveChild = entry.children.some((c) => leafActive(pathname, c.href))
          const GroupIcon = entry.icon

          return (
            <div key={entry.key}>
              <button
                type="button"
                onClick={() => setManual((m) => ({ ...m, [entry.key]: !open }))}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                  hasActiveChild && !open
                    ? 'bg-accent-500/10 text-accent-600'
                    : 'text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-sunken)] hover:text-[color:var(--text-primary)]'
                )}
                aria-expanded={open}
              >
                <GroupIcon size={18} weight={hasActiveChild ? 'fill' : 'regular'} />
                <span className="flex-1 text-start">{entry.label}</span>
                <CaretDown
                  size={13}
                  className={cn('transition-transform', open && 'rotate-180')}
                />
              </button>

              {open && (
                <div className="mt-0.5 space-y-0.5 border-s border-[color:var(--border-subtle)] pe-0 ps-3 ms-4">
                  {entry.children.map((c) => {
                    const active = leafActive(pathname, c.href)
                    const Icon = c.icon
                    return (
                      <Link
                        key={c.href}
                        href={c.href}
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all',
                          active
                            ? 'bg-accent-600 text-white shadow-sm shadow-accent-600/20'
                            : 'text-[color:var(--text-tertiary)] hover:bg-[color:var(--surface-sunken)] hover:text-[color:var(--text-primary)]'
                        )}
                      >
                        <Icon size={15} weight={active ? 'fill' : 'regular'} />
                        {c.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}

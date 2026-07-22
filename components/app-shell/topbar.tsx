'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { CaretDown, SignOut, UserCircle } from '@phosphor-icons/react'
import { authClient } from '@/lib/auth/client'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/theme-toggle'

const ROLE_LABELS: Record<string, string> = {
  owner: 'مالك',
  accountant: 'محاسب',
  branch_manager: 'مدير فرع',
  staff: 'موظف',
}

export function Topbar({
  organizationName,
  userName,
  role,
}: {
  organizationName: string
  userName: string
  role: string
}) {
  async function handleSignOut() {
    await authClient.signOut()
    window.location.assign('/login')
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-6">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[color:var(--text-primary)]">{organizationName}</span>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />

        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none transition-colors hover:bg-[color:var(--surface-sunken)]">
            <UserCircle size={22} className="text-[color:var(--text-secondary)]" />
            <span className="flex flex-col items-start leading-tight">
              <span className="text-[color:var(--text-primary)]">{userName}</span>
            </span>
            <Badge variant="accent">{ROLE_LABELS[role] ?? role}</Badge>
            <CaretDown size={14} className="text-[color:var(--text-tertiary)]" />
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="z-50 min-w-[180px] rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-1 shadow-lg"
            >
              <DropdownMenu.Item
                onSelect={handleSignOut}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-danger-600 outline-none transition-colors hover:bg-danger-500/10"
              >
                <SignOut size={16} />
                تسجيل الخروج
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  )
}

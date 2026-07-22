import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { resolveDashboardSession } from '@/lib/authz/session'
import { Sidebar } from '@/components/app-shell/sidebar'
import { Topbar } from '@/components/app-shell/topbar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts already redirects unauthenticated requests before they reach
  // here — this is defense in depth (same "check again inside, don't trust
  // the edge layer alone" pattern lib/authz/service.ts documents for
  // webhooks/cron), and it's also how this layout gets tenantId/role/name
  // for the shell.
  const session = await resolveDashboardSession(await headers())
  if (!session) redirect('/login')

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex min-h-[100dvh] flex-1 flex-col">
        <Topbar
          organizationName={session.organizationName}
          userName={session.userName}
          role={session.context.role}
        />
        <main className="flex-1 bg-[color:var(--surface-sunken)] p-6">{children}</main>
      </div>
    </div>
  )
}

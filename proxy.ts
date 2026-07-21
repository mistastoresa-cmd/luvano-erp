import { NextRequest, NextResponse } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

// Fast, DB-free check per /plan-eng-review's Architecture Finding 1: reject
// unauthenticated requests before they reach a route handler. This only
// confirms a session cookie exists and isn't expired by its own signed
// timestamp — it does NOT resolve role/branchAccess (that needs a DB query,
// deliberately kept out of middleware; see lib/authz/service.ts's
// resolveCallerContext, called per-request inside route handlers/services).
// Short session TTL (30 min, see lib/auth/server.ts) means a role/branch
// change takes effect on next renewal without needing revocation logic here.
const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/api/auth',
  '/api/health',
  '/api/webhooks',
  '/api/onboarding', // T6: creates the account this middleware would otherwise gate on
]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  const sessionCookie = getSessionCookie(request)
  if (!sessionCookie) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

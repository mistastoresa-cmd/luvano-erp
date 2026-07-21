import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/auth/server'

// Mounts every Better Auth endpoint (sign-in, sign-up, session, organization
// CRUD, etc.) at /api/auth/*. Listed in middleware.ts's PUBLIC_PATHS — these
// routes ARE the login mechanism, they can't require an existing session.
export const { GET, POST } = toNextJsHandler(auth)

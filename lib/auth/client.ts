'use client'

import { createAuthClient } from 'better-auth/react'

// Browser-side Better Auth client for app/login/page.tsx — server-side
// code should keep using `auth` from lib/auth/server.ts directly, never
// this client.
export const authClient = createAuthClient()

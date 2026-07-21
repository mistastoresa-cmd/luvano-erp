import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { provisionTenant } from '@/lib/auth/provisioning'

const bodySchema = z.object({
  ownerName: z.string().min(1),
  ownerEmail: z.email(),
  ownerPassword: z.string().min(8),
  companyName: z.string().min(1),
})

// T6 (RBAC plan): the first onboarding step — signup creates a Luvano-ERP
// tenant and its owner. Listed in middleware.ts's PUBLIC_PATHS — this route
// runs with no session by definition (it's what creates the first one).
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 })
  }

  const result = await provisionTenant(parsed.data)
  const res = NextResponse.json({
    tenantId: result.tenantId,
    organizationId: result.organizationId,
  })
  for (const [key, value] of result.sessionHeaders.entries()) {
    if (key.toLowerCase() === 'set-cookie') res.headers.append(key, value)
  }
  return res
}

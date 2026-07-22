'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: signInError } = await authClient.signIn.email({ email, password })
    setLoading(false)
    if (signInError) {
      setError('البريد الإلكتروني أو كلمة المرور غير صحيحة.')
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[color:var(--surface-sunken)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-600 text-lg font-bold text-white">
            ل
          </div>
          <h1 className="text-lg font-semibold text-[color:var(--text-primary)]">لوفانو ERP</h1>
          <p className="mt-1 text-sm text-[color:var(--text-tertiary)]">تسجيل الدخول إلى حسابك</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@example.com"
                />
              </div>
              <div>
                <Label htmlFor="password">كلمة المرور</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-600">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'جارٍ الدخول...' : 'تسجيل الدخول'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

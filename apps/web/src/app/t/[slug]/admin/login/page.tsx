'use client'
import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getAuthStore } from '@/lib/store'

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const params = useParams()
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
  const expired = searchParams.get('expired') === '1'
  const slug = params.slug as string
  const setToken = getAuthStore(slug)(s => s.setToken)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const isEmail = identifier.includes('@')
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-slug': slug },
        body: JSON.stringify({ ...(isEmail ? { email: identifier } : { username: identifier }), password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Login failed')
      setToken(data.accessToken)
      const isCustomDomain = !window.location.pathname.startsWith('/t/')
      const base = isCustomDomain ? '/admin' : `/t/${slug}/admin`
      if (data.mustChangePassword) {
        router.push(`${base}/change-password`)
      } else {
        // Redirect to first allowed page based on permissions
        const perms: string[] = (() => {
          try {
            const payload = data.accessToken.split('.')[1]
            const padded = payload + '='.repeat((4 - payload.length % 4) % 4)
            return JSON.parse(atob(padded)).permissions ?? []
          } catch { return [] }
        })()
        const routes = [
          { path: '', perm: 'analytics.view' },
          { path: '/pos', perm: 'sales.create' },
          { path: '/sales', perm: 'sales.view' },
          { path: '/inventory', perm: 'inventory.view' },
        ]
        const first = routes.find(r => perms.includes(r.perm))
        router.push(`${base}${first?.path ?? ''}`)
      }
    } catch (err: any) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)]">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)] text-center mb-2">{slug}</h1>
        <p className="text-sm text-[var(--color-text)] text-center mb-8">Inicia sesión en tu panel</p>
        <form onSubmit={handleSubmit} className="card p-8 space-y-4">
          {expired && <p className="text-amber-600 text-sm text-center bg-amber-50 rounded-lg py-2">Tu sesión ha expirado. Inicia sesión de nuevo.</p>}
          {error && <p className="text-red-500 text-sm text-center bg-red-50 rounded-lg py-2">{error}</p>}
          <div><label className="label">Usuario o Email</label><input type="text" value={identifier} onChange={e => setIdentifier(e.target.value)} className="input" required /></div>
          <div><label className="label">Contraseña</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input" required /></div>
          <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Entrando...' : 'Entrar'}</button>
        </form>
      </div>
    </div>
  )
}

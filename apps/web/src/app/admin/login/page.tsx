'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()
  const setToken = useAuthStore(s => s.setToken)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const { accessToken } = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      setToken(accessToken)
      router.push('/admin')
    } catch (err: any) { setError(err.message) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)]">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)] text-center mb-2">StoreHub</h1>
        <p className="text-sm text-[var(--color-text)] text-center mb-8">Inicia sesión en tu panel</p>
        <form onSubmit={handleSubmit} className="card p-8 space-y-4">
          {error && <p className="text-red-500 text-sm text-center bg-red-50 rounded-lg py-2">{error}</p>}
          <div>
            <label className="label">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input" required />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input" required />
          </div>
          <button type="submit" className="btn-primary w-full">Entrar</button>
          {process.env.NEXT_PUBLIC_SHOW_DEV_CREDENTIALS === 'true' && (
            <p className="text-xs text-[var(--color-text)] text-center opacity-50">admin@demo-cafe.com / password123</p>
          )}
        </form>
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function PlatformLogin() {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Verify key by trying to list tenants
    const res = await fetch('/api/platform/tenants', { headers: { 'x-platform-key': key } })
    if (res.ok) {
      localStorage.setItem('platform-key', key)
      router.push('/platform')
    } else {
      setError('API key inválida')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)]">
      <form onSubmit={handleSubmit} className="card p-8 w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-[var(--color-text-dark)] text-center">Platform Admin</h1>
        <p className="text-sm text-[var(--color-text)] text-center">Ingresa tu API key de plataforma</p>
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="Platform API Key" className="input" required />
        <button type="submit" className="btn-primary w-full">Acceder</button>
      </form>
    </div>
  )
}

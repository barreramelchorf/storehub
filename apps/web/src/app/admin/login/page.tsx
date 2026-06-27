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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-center">Iniciar sesión</h1>
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border rounded p-2" required />
        <input type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} className="w-full border rounded p-2" required />
        <button type="submit" className="w-full bg-primary text-white rounded p-2 font-medium">Entrar</button>
      </form>
    </div>
  )
}

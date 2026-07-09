'use client'
import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getAuthStore } from '@/lib/store'
import { passwordRequirements } from '@storehub/schemas'

export default function ChangePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string
  const setToken = getAuthStore(slug)(s => s.setToken)

  const allMet = passwordRequirements.every(r => r.test(password))
  const passwordsMatch = password === confirm && password.length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!allMet) return setError('La contraseña no cumple los requisitos')
    if (!passwordsMatch) return setError('Las contraseñas no coinciden')

    setError('')
    setLoading(true)
    try {
      const pathMatch = window.location.pathname.match(/^\/t\/([a-z0-9-]+)/)
      const tenantHeader: Record<string, string> = {}
      if (pathMatch) tenantHeader['x-tenant-slug'] = pathMatch[1]

      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...tenantHeader },
        credentials: 'include',
        body: JSON.stringify({ newPassword: password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al cambiar contraseña')

      setToken(data.accessToken)
      const isCustomDomain = !window.location.pathname.startsWith('/t/')
      router.push(isCustomDomain ? '/admin' : `/t/${slug}/admin`)
    } catch (err: any) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)]">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)] text-center mb-2">Cambiar contraseña</h1>
        <p className="text-sm text-[var(--color-text)] text-center mb-8">Por seguridad, debes establecer una nueva contraseña</p>
        <form onSubmit={handleSubmit} className="card p-8 space-y-4">
          {error && <p className="text-red-500 text-sm text-center bg-red-50 rounded-lg py-2">{error}</p>}
          <div>
            <label className="label">Nueva contraseña</label>
            <div className="relative"><input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="input pr-10" autoComplete="new-password" required /><button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text)] hover:text-[var(--color-text-dark)]">{showPassword ? <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> : <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>}</button></div>
            {password && (
              <div className="mt-2 space-y-1">
                {passwordRequirements.map(req => (
                  <p key={req.key} className={`text-xs flex items-center gap-1 ${req.test(password) ? 'text-green-600' : 'text-[var(--color-text)]'}`}>
                    <span>{req.test(password) ? '✓' : '○'}</span> {req.label}
                  </p>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="label">Confirmar contraseña</label>
            <div className="relative"><input type={showConfirm ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} className="input pr-10" autoComplete="new-password" required /><button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text)] hover:text-[var(--color-text-dark)]">{showConfirm ? <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> : <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>}</button></div>
            {confirm && !passwordsMatch && <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>}
            {confirm && passwordsMatch && <p className="text-xs text-green-600 mt-1">✓ Coinciden</p>}
          </div>
          <button type="submit" disabled={loading || !allMet || !passwordsMatch} className="btn-primary w-full disabled:opacity-50">
            {loading ? 'Guardando...' : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}

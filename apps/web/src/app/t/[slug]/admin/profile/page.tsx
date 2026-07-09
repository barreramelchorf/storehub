'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { getAuthStore } from '@/lib/store'
import { useParams } from 'next/navigation'
import { passwordRequirements } from '@storehub/schemas'

export default function ProfilePage() {
  const params = useParams(); const token = getAuthStore(params.slug as string)(s => s.token)!
  const queryClient = useQueryClient()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [success, setSuccess] = useState(false)

  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: () => api('/api/admin/profile', { token }) })

  const changeMutation = useMutation({
    mutationFn: () => api('/api/admin/profile/password', {
      method: 'PUT', token,
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
    onSuccess: () => {
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setSuccess(true)
      setTimeout(() => setSuccess(false), 5000)
    },
  })

  const allMet = passwordRequirements.every(r => r.test(newPassword))
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text-dark)] mb-6">Mi perfil</h1>

      <div className="space-y-6 max-w-lg">
        {/* User info */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-4">Información</h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-[var(--color-text)]">Nombre de usuario</p>
              <p className="font-medium text-[var(--color-text-dark)]">{profile?.username ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text)]">Email</p>
              <p className="font-medium text-[var(--color-text-dark)]">{profile?.email}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text)]">Rol</p>
              <p className="font-medium text-[var(--color-text-dark)] capitalize">{profile?.role?.name}</p>
            </div>
          </div>
        </div>

        {/* Change password */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-4">Cambiar contraseña</h2>
          {success && <p className="text-green-600 text-sm mb-4 bg-green-50 rounded-lg py-2 px-3">✓ Contraseña actualizada correctamente</p>}
          <form onSubmit={e => { e.preventDefault(); changeMutation.mutate() }} className="space-y-3">
            <div>
              <label className="label">Contraseña actual</label>
              <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="input" autoComplete="current-password" required />
            </div>
            <div>
              <label className="label">Nueva contraseña</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="input" autoComplete="new-password" required />
              {newPassword && (
                <div className="mt-2 space-y-1">
                  {passwordRequirements.map(req => (
                    <p key={req.key} className={`text-xs flex items-center gap-1 ${req.test(newPassword) ? 'text-green-600' : 'text-[var(--color-text)]'}`}>
                      <span>{req.test(newPassword) ? '✓' : '○'}</span> {req.label}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="label">Confirmar nueva contraseña</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="input" autoComplete="new-password" required />
              {confirmPassword && !passwordsMatch && <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>}
              {confirmPassword && passwordsMatch && <p className="text-xs text-green-600 mt-1">✓ Coinciden</p>}
            </div>
            <button type="submit" disabled={changeMutation.isPending || !allMet || !passwordsMatch || !currentPassword}
              className="btn-primary w-full disabled:opacity-50">
              {changeMutation.isPending ? 'Guardando...' : 'Cambiar contraseña'}
            </button>
            {changeMutation.isError && <p className="text-red-500 text-xs text-center">{(changeMutation.error as Error).message}</p>}
          </form>
        </div>
      </div>
    </div>
  )
}

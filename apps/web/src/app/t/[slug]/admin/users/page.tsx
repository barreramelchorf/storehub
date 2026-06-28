'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

export default function UsersPage() {
  const token = useAuthStore(s => s.token)!
  const queryClient = useQueryClient()
  const [modal, setModal] = useState<string | null>(null)
  const [form, setForm] = useState({ email: '', password: '', roleId: '' })

  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => api('/api/admin/users', { token }) })
  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: () => api('/api/admin/roles', { token }) })

  const createUser = useMutation({
    mutationFn: (body: any) => api('/api/admin/users', { method: 'POST', body: JSON.stringify(body), token }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); setModal(null) },
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">Usuarios</h1>
        <button onClick={() => { setForm({ email: '', password: '', roleId: '' }); setModal('new') }} className="btn-primary">+ Nuevo usuario</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]"><th className="p-3 text-left table-header">Email</th><th className="p-3 table-header">Rol</th><th className="p-3 table-header">Estado</th></tr></thead>
          <tbody>
            {users?.map((u: any) => (
              <tr key={u.id} className="border-b border-[var(--color-border)]">
                <td className="p-3 font-medium text-[var(--color-text-dark)]">{u.email}</td>
                <td className="p-3 text-center"><span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{roles?.find((r: any) => r.id === u.roleId)?.name ?? '-'}</span></td>
                <td className="p-3 text-center">{u.active ? <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">Activo</span> : <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full">Inactivo</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--color-text-dark)]">Nuevo usuario</h2>
            <form onSubmit={e => { e.preventDefault(); createUser.mutate(form) }} className="space-y-3">
              <div><label className="label">Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input" required /></div>
              <div><label className="label">Contraseña</label><input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="input" required minLength={8} /></div>
              <div><label className="label">Rol</label>
                <select value={form.roleId} onChange={e => setForm(f => ({ ...f, roleId: e.target.value }))} className="input" required>
                  <option value="">Seleccionar...</option>
                  {roles?.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1">Crear</button>
                <button type="button" onClick={() => setModal(null)} className="btn-secondary">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

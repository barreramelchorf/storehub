'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { getAuthStore } from '@/lib/store'
import { useParams } from 'next/navigation'

export default function UsersPage() {
  const params = useParams(); const token = getAuthStore(params.slug as string)(s => s.token)!
  const queryClient = useQueryClient()
  const [modal, setModal] = useState<{ id: string | null } | null>(null)
  const [form, setForm] = useState({ email: '', username: '', password: '', roleId: '' })

  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => api('/api/admin/users', { token }) })
  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: () => api('/api/admin/roles', { token }) })

  const saveMutation = useMutation({
    mutationFn: (body: any) => {
      if (modal?.id) return api(`/api/admin/users/${modal.id}`, { method: 'PUT', body: JSON.stringify(body), token })
      return api('/api/admin/users', { method: 'POST', body: JSON.stringify(body), token })
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); setModal(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/admin/users/${id}`, { method: 'DELETE', token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })

  const openNew = () => { setForm({ email: '', username: '', password: '', roleId: '' }); setModal({ id: null }) }
  const openEdit = (u: any) => { setForm({ email: u.email, username: u.username ?? '', password: '', roleId: u.roleId }); setModal({ id: u.id }) }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">Usuarios</h1>
        <button onClick={openNew} className="btn-primary">+ Nuevo usuario</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]"><th className="p-3 text-left table-header">Usuario</th><th className="p-3 table-header">Email</th><th className="p-3 table-header">Rol</th><th className="p-3 table-header">Estado</th><th className="p-3 table-header">Acciones</th></tr></thead>
          <tbody>
            {users?.map((u: any) => (
              <tr key={u.id} className="border-b border-[var(--color-border)]">
                <td className="p-3 font-medium text-[var(--color-text-dark)]">{u.username ?? '-'}</td>
                <td className="p-3 text-[var(--color-text)]">{u.email}</td>
                <td className="p-3 text-center"><span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{roles?.find((r: any) => r.id === u.roleId)?.name ?? '-'}</span></td>
                <td className="p-3 text-center">{u.active ? <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">Activo</span> : <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full">Inactivo</span>}</td>
                <td className="p-3 text-center">
                  <div className="flex justify-center gap-1">
                    <button onClick={() => openEdit(u)} className="btn-secondary text-xs px-2 py-1">Editar</button>
                    <button onClick={() => { if(confirm('¿Eliminar usuario?')) deleteMutation.mutate(u.id) }} className="btn-danger">Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--color-text-dark)]">{modal.id ? 'Editar usuario' : 'Nuevo usuario'}</h2>
            <form onSubmit={e => { e.preventDefault(); const body: any = { email: form.email, username: form.username, roleId: form.roleId }; if (form.password) body.password = form.password; saveMutation.mutate(body) }} className="space-y-3">
              <div><label className="label">Nombre de usuario</label><input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} className="input" placeholder="admin" autoComplete="off" /></div>
              <div><label className="label">Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input" required autoComplete="off" /></div>
              <div><label className="label">{modal.id ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}</label><input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="input" autoComplete="new-password" {...(!modal.id && { required: true, minLength: 8 })} /></div>
              <div><label className="label">Rol</label>
                <select value={form.roleId} onChange={e => setForm(f => ({ ...f, roleId: e.target.value }))} className="input" required>
                  <option value="">Seleccionar...</option>
                  {roles?.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={saveMutation.isPending} className="btn-primary flex-1">{saveMutation.isPending ? 'Guardando...' : 'Guardar'}</button>
                <button type="button" onClick={() => setModal(null)} className="btn-secondary">Cancelar</button>
              </div>
              {saveMutation.isError && <p className="text-red-500 text-xs">{(saveMutation.error as Error).message}</p>}
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

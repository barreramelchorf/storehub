'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

function platformFetch(path: string, opts: RequestInit = {}) {
  const key = localStorage.getItem('platform-key') ?? ''
  return fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', 'x-platform-key': key, ...opts.headers } }).then(async r => {
    if (!r.ok) throw new Error((await r.json()).error ?? 'Error')
    return r.json()
  })
}

export default function PlatformPage() {
  const queryClient = useQueryClient()
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', giro: 'other', adminEmail: '', adminPassword: '' })

  const { data: tenants } = useQuery({ queryKey: ['tenants'], queryFn: () => platformFetch('/api/platform/tenants') })

  const createTenant = useMutation({
    mutationFn: (body: any) => platformFetch('/api/platform/tenants', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tenants'] }); setModal(false); setForm({ name: '', slug: '', giro: 'other', adminEmail: '', adminPassword: '' }) },
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-[var(--color-text-dark)]">Tenants</h2>
        <button onClick={() => setModal(true)} className="btn-primary">+ Nuevo tenant</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
              <th className="p-3 text-left table-header">Nombre</th>
              <th className="p-3 table-header">Slug</th>
              <th className="p-3 table-header">Giro</th>
              <th className="p-3 table-header">Creado</th>
              <th className="p-3 table-header">Links</th>
            </tr>
          </thead>
          <tbody>
            {tenants?.map((t: any) => (
              <tr key={t.id} className="border-b border-[var(--color-border)]">
                <td className="p-3 font-medium text-[var(--color-text-dark)]">{t.name}</td>
                <td className="p-3 text-center"><code className="text-xs bg-gray-100 px-2 py-0.5 rounded">{t.slug}</code></td>
                <td className="p-3 text-center text-xs">{t.giro}</td>
                <td className="p-3 text-center text-xs text-[var(--color-text)]">{new Date(t.createdAt).toLocaleDateString()}</td>
                <td className="p-3 text-center space-x-2">
                  <a href={`/t/${t.slug}`} target="_blank" className="text-xs text-[var(--color-primary)] hover:underline">Tienda</a>
                  <a href={`/t/${t.slug}/admin/login`} target="_blank" className="text-xs text-[var(--color-primary)] hover:underline">Admin</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--color-text-dark)]">Nuevo tenant</h2>
            <form onSubmit={e => { e.preventDefault(); createTenant.mutate(form) }} className="space-y-3">
              <div><label className="label">Nombre del negocio</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" required /></div>
              <div><label className="label">Slug (URL)</label><input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} className="input" required placeholder="mi-tienda" /></div>
              <div><label className="label">Giro</label>
                <select value={form.giro} onChange={e => setForm(f => ({ ...f, giro: e.target.value }))} className="input">
                  <option value="cafeteria">Cafetería</option>
                  <option value="restaurant">Restaurante</option>
                  <option value="electronics">Electrónica</option>
                  <option value="bakery">Panadería</option>
                  <option value="other">Otro</option>
                </select>
              </div>
              <div><label className="label">Email del admin</label><input type="email" value={form.adminEmail} onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))} className="input" required /></div>
              <div><label className="label">Contraseña del admin</label><input type="password" value={form.adminPassword} onChange={e => setForm(f => ({ ...f, adminPassword: e.target.value }))} className="input" required minLength={8} /></div>
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={createTenant.isPending} className="btn-primary flex-1">{createTenant.isPending ? 'Creando...' : 'Crear tenant'}</button>
                <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancelar</button>
              </div>
              {createTenant.isError && <p className="text-red-500 text-xs">{(createTenant.error as Error).message}</p>}
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

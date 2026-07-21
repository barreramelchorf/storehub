'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { getAuthStore } from '@/lib/store'
import { useParams } from 'next/navigation'

export default function SettingsPage() {
  const params = useParams(); const token = getAuthStore(params.slug as string)(s => s.token)!
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ name: '', primaryColor: '#635BFF', secondaryColor: '#0A2540', address: '', phone: '', whatsapp: '', email: '', hours: '', instagram: '', facebook: '', tiktok: '', website: '', metaTitle: '', metaDescription: '', multicomanda: false, modifiers: false })

  const { data: info } = useQuery({ queryKey: ['settings'], queryFn: () => api('/api/admin/settings', { token }) })

  useEffect(() => {
    if (info) {
      const c = info.config ?? {}
      setForm({
        name: info.name ?? '',
        primaryColor: c.branding?.primaryColor ?? '#635BFF',
        secondaryColor: c.branding?.secondaryColor ?? '#0A2540',
        address: c.contact?.address ?? '', phone: c.contact?.phone ?? '', whatsapp: c.contact?.whatsapp ?? '', email: c.contact?.email ?? '', hours: c.contact?.hours ?? '',
        instagram: c.social?.instagram ?? '', facebook: c.social?.facebook ?? '', tiktok: c.social?.tiktok ?? '', website: c.social?.website ?? '',
        metaTitle: c.meta?.title ?? '', metaDescription: c.meta?.description ?? '',
        multicomanda: c.modules?.multicomanda ?? false,
        modifiers: c.modules?.modifiers ?? false,
      })
    }
  }, [info])

  const saveMutation = useMutation({
    mutationFn: () => api('/api/admin/settings', {
      method: 'PUT', token,
      body: JSON.stringify({
        name: form.name,
        config: {
          branding: { primaryColor: form.primaryColor, secondaryColor: form.secondaryColor },
          contact: { address: form.address, phone: form.phone, whatsapp: form.whatsapp, email: form.email, hours: form.hours },
          social: { instagram: form.instagram, facebook: form.facebook, tiktok: form.tiktok, website: form.website },
          meta: { title: form.metaTitle, description: form.metaDescription },
          modules: { ...info?.config?.modules, pos: true, inventory: true, analytics: true, multicomanda: form.multicomanda, modifiers: form.modifiers },
        },
      }),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }).then(() => queryClient.invalidateQueries({ queryKey: ['tenant-config'] })),
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">Configuración</h1>
        <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="btn-primary">{saveMutation.isPending ? 'Guardando...' : 'Guardar cambios'}</button>
      </div>
      {saveMutation.isSuccess && <p className="text-green-600 text-sm mb-4">✓ Guardado</p>}

      <div className="space-y-6">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-4">General</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="label">Nombre del negocio</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Color primario</label><input type="color" value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))} className="input h-10" /></div>
              <div><label className="label">Color secundario</label><input type="color" value={form.secondaryColor} onChange={e => setForm(f => ({ ...f, secondaryColor: e.target.value }))} className="input h-10" /></div>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-4">Contacto</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="label">Dirección</label><input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="input" /></div>
            <div><label className="label">Teléfono</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="input" /></div>
            <div><label className="label">WhatsApp</label><input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} className="input" placeholder="Déjalo vacío si es el mismo que teléfono" /></div>
            <div><label className="label">Email</label><input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input" /></div>
            <div className="md:col-span-2"><label className="label">Horarios</label><input value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} className="input" /></div>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-4">Redes sociales</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="label">Instagram</label><input value={form.instagram} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))} className="input" placeholder="@usuario" /></div>
            <div><label className="label">Facebook</label><input value={form.facebook} onChange={e => setForm(f => ({ ...f, facebook: e.target.value }))} className="input" placeholder="@tupagina o URL completa" /></div>
            <div><label className="label">TikTok</label><input value={form.tiktok} onChange={e => setForm(f => ({ ...f, tiktok: e.target.value }))} className="input" /></div>
            <div><label className="label">Sitio web</label><input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} className="input" /></div>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-4">SEO</h2>
          <div className="grid grid-cols-1 gap-4">
            <div><label className="label">Título</label><input value={form.metaTitle} onChange={e => setForm(f => ({ ...f, metaTitle: e.target.value }))} className="input" /></div>
            <div><label className="label">Descripción</label><input value={form.metaDescription} onChange={e => setForm(f => ({ ...f, metaDescription: e.target.value }))} className="input" /></div>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-4">Módulos</h2>
          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm font-medium text-[var(--color-text-dark)]">Multicomanda</p>
                <p className="text-xs text-[var(--color-text)]">Permite manejar múltiples cuentas/mesas simultáneas en el POS</p>
              </div>
              <input type="checkbox" checked={form.multicomanda} onChange={e => setForm(f => ({ ...f, multicomanda: e.target.checked }))} className="w-5 h-5 rounded border-[var(--color-border)] text-[var(--color-primary)]" />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm font-medium text-[var(--color-text-dark)]">Modificadores / Extras</p>
                <p className="text-xs text-[var(--color-text)]">Permite agregar extras o toppings a los productos en el POS</p>
              </div>
              <input type="checkbox" checked={form.modifiers} onChange={e => setForm(f => ({ ...f, modifiers: e.target.checked }))} className="w-5 h-5 rounded border-[var(--color-border)] text-[var(--color-primary)]" />
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { getAuthStore } from '@/lib/store'
import { useParams } from 'next/navigation'

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export default function CampaignsPage() {
  const params = useParams(); const token = getAuthStore(params.slug as string)(s => s.token)!
  const queryClient = useQueryClient()

  const emptyCampaign = { id: null as string | null, name: '', type: 'nxm' as 'nxm' | 'percentage', buy: '3', pay: '2', percent: '10', daysOfWeek: [] as number[], active: true, priority: 0, productIds: [] as string[], categoryIds: [] as string[] }
  const [form, setForm] = useState<typeof emptyCampaign | null>(null)

  const { data: campaignsList } = useQuery({ queryKey: ['campaigns'], queryFn: () => api('/api/admin/campaigns', { token }) })
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api('/api/admin/categories', { token }) })
  const { data: products } = useQuery({ queryKey: ['products-all'], queryFn: () => api('/api/admin/products?pageSize=500', { token }) })

  const saveMutation = useMutation({
    mutationFn: (body: typeof emptyCampaign) => {
      const payload = {
        name: body.name,
        type: body.type,
        config: body.type === 'nxm' ? { buy: Number(body.buy), pay: Number(body.pay) } : { percent: Number(body.percent) },
        daysOfWeek: body.daysOfWeek,
        active: body.active,
        priority: Number(body.priority) || 0,
        productIds: body.productIds,
        categoryIds: body.categoryIds,
      }
      return body.id
        ? api(`/api/admin/campaigns/${body.id}`, { method: 'PUT', body: JSON.stringify(payload), token })
        : api('/api/admin/campaigns', { method: 'POST', body: JSON.stringify(payload), token })
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['campaigns'] }); setForm(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/admin/campaigns/${id}`, { method: 'DELETE', token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">Campañas</h1>
        <button onClick={() => setForm({ ...emptyCampaign })} className="btn-primary">+ Nueva campaña</button>
      </div>

      {campaignsList?.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campaignsList.map((c: any) => {
            const offerBadge = c.type === 'nxm' ? `${c.config.buy}x${c.config.pay}` : `${c.config.percent}% off`
            const daysLabel = (c.daysOfWeek?.length ?? 0) === 0 ? 'Todos los días' : c.daysOfWeek.map((d: number) => DAY_NAMES[d]).join(', ')
            return (
              <div key={c.id} className={`card p-4 ${!c.active ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-[var(--color-text-dark)]">{c.name}</h3>
                  <span className="text-[10px] font-bold bg-[var(--color-primary)] text-white px-2 py-0.5 rounded-full">{offerBadge}</span>
                  {!c.active && <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactiva</span>}
                </div>
                <p className="text-xs text-[var(--color-text)]">📅 {daysLabel}</p>
                <p className="text-xs text-[var(--color-text)] mt-1">
                  {c.productLinks?.length ?? 0} producto(s) · {c.categoryLinks?.length ?? 0} categoría(s) · prioridad {c.priority}
                </p>
                <div className="flex gap-1 mt-3 pt-3 border-t border-[var(--color-border)]">
                  <button onClick={() => setForm({
                    id: c.id, name: c.name, type: c.type,
                    buy: String(c.config.buy ?? 3), pay: String(c.config.pay ?? 2), percent: String(c.config.percent ?? 10),
                    daysOfWeek: c.daysOfWeek ?? [], active: c.active, priority: c.priority,
                    productIds: (c.productLinks ?? []).map((l: any) => l.productId),
                    categoryIds: (c.categoryLinks ?? []).map((l: any) => l.categoryId),
                  })} className="btn-secondary text-xs px-2 py-1">Editar</button>
                  <button onClick={() => { if (confirm(`¿Eliminar campaña "${c.name}"?`)) deleteMutation.mutate(c.id) }} className="text-xs px-2 py-1 rounded-md bg-red-50 text-red-600 hover:bg-red-100 transition-colors">Eliminar</button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card p-8 text-center text-[var(--color-text)]">
          <p className="text-3xl mb-2">🎁</p>
          <p>No hay campañas de ofertas</p>
          <p className="text-xs mt-1">Crea una (ej: 3x2 o descuento por día) para tus productos o categorías</p>
        </div>
      )}

      {/* Campaign Form Modal */}
      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setForm(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <h2 className="text-lg font-bold text-[var(--color-text-dark)]">{form.id ? 'Editar campaña' : 'Nueva campaña'}</h2>
              <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form) }} className="space-y-3">
                <div><label className="label">Nombre</label><input value={form.name} onChange={e => setForm(f => f ? { ...f, name: e.target.value } : f)} className="input" placeholder="Ej: Martes de 3x2" required /></div>

                <div>
                  <label className="label">Tipo de oferta</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setForm(f => f ? { ...f, type: 'nxm' } : f)} className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.type === 'nxm' ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text-dark)]'}`}>NxM (ej: 3x2)</button>
                    <button type="button" onClick={() => setForm(f => f ? { ...f, type: 'percentage' } : f)} className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.type === 'percentage' ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text-dark)]'}`}>Descuento %</button>
                  </div>
                </div>

                {form.type === 'nxm' ? (
                  <div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="label">Compra (N)</label><input type="number" min="2" value={form.buy} onChange={e => setForm(f => f ? { ...f, buy: e.target.value } : f)} className="input" required /></div>
                      <div><label className="label">Paga (M)</label><input type="number" min="1" value={form.pay} onChange={e => setForm(f => f ? { ...f, pay: e.target.value } : f)} className="input" required /></div>
                    </div>
                    <p className="text-xs text-[var(--color-text)] mt-1">{form.buy}x{form.pay} — de cada {form.buy} unidades, {Math.max(0, Number(form.buy) - Number(form.pay))} gratis (la(s) más barata(s))</p>
                  </div>
                ) : (
                  <div>
                    <label className="label">Porcentaje de descuento</label>
                    <input type="number" min="1" max="100" value={form.percent} onChange={e => setForm(f => f ? { ...f, percent: e.target.value } : f)} className="input" required />
                    <p className="text-xs text-[var(--color-text)] mt-1">{form.percent}% off sobre los productos elegibles</p>
                  </div>
                )}

                <div>
                  <label className="label">Días activos <span className="text-[var(--color-text)] font-normal">(vacío = todos los días)</span></label>
                  <div className="flex gap-1 flex-wrap">
                    {DAY_NAMES.map((d, i) => {
                      const selected = form.daysOfWeek.includes(i)
                      return (
                        <button key={i} type="button" onClick={() => setForm(f => f ? { ...f, daysOfWeek: selected ? f.daysOfWeek.filter(x => x !== i) : [...f.daysOfWeek, i] } : f)}
                          className={`w-10 py-1.5 rounded-lg text-xs font-medium border transition-colors ${selected ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text)]'}`}>{d}</button>
                      )
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Prioridad</label><input type="number" min="0" value={form.priority} onChange={e => setForm(f => f ? { ...f, priority: Number(e.target.value) } : f)} className="input" /></div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer mt-6">
                    <input type="checkbox" checked={form.active} onChange={e => setForm(f => f ? { ...f, active: e.target.checked } : f)} className="w-4 h-4 rounded border-[var(--color-border)]" />
                    <span className="text-[var(--color-text-dark)]">Activa</span>
                  </label>
                </div>

                <div>
                  <label className="label">Aplica a categorías</label>
                  <div className="space-y-1 max-h-32 overflow-y-auto border border-[var(--color-border)] rounded-lg p-2">
                    {categories?.map((c: any) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer py-1">
                        <input type="checkbox" checked={form.categoryIds.includes(c.id)}
                          onChange={e => setForm(f => f ? { ...f, categoryIds: e.target.checked ? [...f.categoryIds, c.id] : f.categoryIds.filter(x => x !== c.id) } : f)}
                          className="w-4 h-4 rounded border-[var(--color-border)]" />
                        <span className="text-[var(--color-text-dark)]">{c.name}</span>
                      </label>
                    ))}
                    {(!categories || categories.length === 0) && <p className="text-xs text-[var(--color-text)]">Sin categorías</p>}
                  </div>
                </div>

                <div>
                  <label className="label">Aplica a productos específicos</label>
                  <div className="space-y-1 max-h-32 overflow-y-auto border border-[var(--color-border)] rounded-lg p-2">
                    {products?.items?.map((p: any) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer py-1">
                        <input type="checkbox" checked={form.productIds.includes(p.id)}
                          onChange={e => setForm(f => f ? { ...f, productIds: e.target.checked ? [...f.productIds, p.id] : f.productIds.filter(x => x !== p.id) } : f)}
                          className="w-4 h-4 rounded border-[var(--color-border)]" />
                        <span className="text-[var(--color-text-dark)]">{p.name}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-[var(--color-text)] mt-1">Puedes combinar categorías y productos. Debe haber al menos uno.</p>
                </div>

                <div className="flex gap-2 pt-2 sticky bottom-0 bg-white pb-1">
                  <button type="submit" disabled={saveMutation.isPending || (form.categoryIds.length === 0 && form.productIds.length === 0)} className="btn-primary flex-1">{saveMutation.isPending ? 'Guardando...' : 'Guardar'}</button>
                  <button type="button" onClick={() => setForm(null)} className="btn-secondary">Cancelar</button>
                </div>
                {saveMutation.isError && <p className="text-red-500 text-xs">{(saveMutation.error as Error).message}</p>}
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

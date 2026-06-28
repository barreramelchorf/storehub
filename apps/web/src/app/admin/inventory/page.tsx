'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { ImageUpload } from '@/components/ImageUpload'

export default function InventoryPage() {
  const token = useAuthStore(s => s.token)!
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'products' | 'categories'>('products')
  const [modal, setModal] = useState<{ type: 'product' | 'category'; id: string | null } | null>(null)
  const [form, setForm] = useState({ name: '', price: '', stock: '', minStock: '', categoryId: '', description: '', active: true, visible: true })
  const [catForm, setCatForm] = useState({ name: '', description: '' })

  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => api('/api/admin/products?pageSize=100', { token }) })
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api('/api/admin/categories', { token }) })

  const saveMutation = useMutation({
    mutationFn: (body: any) => {
      if (modal?.id) return api(`/api/admin/products/${modal.id}`, { method: 'PUT', body: JSON.stringify(body), token })
      return api('/api/admin/products', { method: 'POST', body: JSON.stringify(body), token })
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); setModal(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/admin/products/${id}`, { method: 'DELETE', token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })

  const catSaveMutation = useMutation({
    mutationFn: (body: any) => {
      if (modal?.id) return api(`/api/admin/categories/${modal.id}`, { method: 'PUT', body: JSON.stringify(body), token })
      return api('/api/admin/categories', { method: 'POST', body: JSON.stringify(body), token })
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categories'] }); setModal(null) },
  })

  const catDeleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/admin/categories/${id}`, { method: 'DELETE', token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  })

  const openNewProduct = () => { setForm({ name: '', price: '', stock: '', minStock: '', categoryId: '', description: '', active: true, visible: true }); setModal({ type: 'product', id: null }) }
  const openEditProduct = (p: any) => { setForm({ name: p.name, price: String(Number(p.price)), stock: String(p.stock), minStock: String(p.minStock), categoryId: p.categoryId, description: p.description ?? '', active: p.active, visible: p.visible }); setModal({ type: 'product', id: p.id }) }
  const openNewCategory = () => { setCatForm({ name: '', description: '' }); setModal({ type: 'category', id: null }) }
  const openEditCategory = (c: any) => { setCatForm({ name: c.name, description: c.description ?? '' }); setModal({ type: 'category', id: c.id }) }

  const getCategoryName = (id: string) => categories?.find((c: any) => c.id === id)?.name ?? '-'
  const currentProduct = modal?.type === 'product' && modal.id ? products?.items?.find((p: any) => p.id === modal.id) : null

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">Inventario</h1>
        <div className="flex gap-2">
          <button onClick={() => setTab('products')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'products' ? 'bg-[var(--color-primary)] text-white' : 'bg-white border border-[var(--color-border)] text-[var(--color-text)]'}`}>Productos</button>
          <button onClick={() => setTab('categories')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'categories' ? 'bg-[var(--color-primary)] text-white' : 'bg-white border border-[var(--color-border)] text-[var(--color-text)]'}`}>Categorías</button>
        </div>
      </div>

      {tab === 'products' && (
        <>
          <div className="mb-4"><button onClick={openNewProduct} className="btn-primary">+ Nuevo producto</button></div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]"><th className="p-3 text-left table-header">Producto</th><th className="p-3 table-header">Categoría</th><th className="p-3 table-header">Precio</th><th className="p-3 table-header">Stock</th><th className="p-3 table-header">Estado</th><th className="p-3 table-header">Acciones</th></tr></thead>
              <tbody>
                {products?.items?.map((p: any) => (
                  <tr key={p.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface)] transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        {p.images?.[0] ? <img src={p.images[0]} className="w-9 h-9 rounded-lg object-cover" /> : <span className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-sm">📦</span>}
                        <span className="font-medium text-[var(--color-text-dark)]">{p.name}</span>
                      </div>
                    </td>
                    <td className="p-3 text-center text-xs text-[var(--color-text)]">{getCategoryName(p.categoryId)}</td>
                    <td className="p-3 text-center font-medium">${Number(p.price).toFixed(2)}</td>
                    <td className="p-3 text-center">{p.stock}</td>
                    <td className="p-3 text-center">{p.stock <= p.minStock ? <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">Bajo</span> : <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">OK</span>}</td>
                    <td className="p-3 text-center">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => openEditProduct(p)} className="btn-secondary text-xs px-2 py-1">Editar</button>
                        <button onClick={() => { if(confirm('¿Eliminar?')) deleteMutation.mutate(p.id) }} className="btn-danger">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'categories' && (
        <>
          <div className="mb-4"><button onClick={openNewCategory} className="btn-primary">+ Nueva categoría</button></div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]"><th className="p-3 text-left table-header">Categoría</th><th className="p-3 table-header">Descripción</th><th className="p-3 table-header">Acciones</th></tr></thead>
              <tbody>
                {categories?.map((c: any) => (
                  <tr key={c.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface)] transition-colors">
                    <td className="p-3 font-medium text-[var(--color-text-dark)]">{c.name}</td>
                    <td className="p-3 text-[var(--color-text)]">{c.description ?? '-'}</td>
                    <td className="p-3 text-center">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => openEditCategory(c)} className="btn-secondary text-xs px-2 py-1">Editar</button>
                        <button onClick={() => { if(confirm('¿Eliminar?')) catDeleteMutation.mutate(c.id) }} className="btn-danger">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            {modal.type === 'product' && (
              <>
                <h2 className="text-lg font-bold text-[var(--color-text-dark)]">{modal.id ? 'Editar producto' : 'Nuevo producto'}</h2>
                <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate({ ...form, price: Number(form.price), stock: Number(form.stock), minStock: Number(form.minStock), active: form.active, visible: form.visible }) }} className="space-y-3">
                  <div><label className="label">Nombre</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" required /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="label">Precio</label><input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} className="input" required /></div>
                    <div><label className="label">Categoría</label>
                      <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} className="input" required>
                        <option value="">Seleccionar...</option>
                        {categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="label">Stock</label><input type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} className="input" required /></div>
                    <div><label className="label">Stock mínimo</label><input type="number" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))} className="input" /></div>
                  </div>
                  <div><label className="label">Descripción</label><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input" /></div>

                  <div className="flex gap-6 pt-1">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="w-4 h-4 rounded border-[var(--color-border)]" />
                      <span className="text-[var(--color-text-dark)]">Activo</span>
                      <span className="text-xs text-[var(--color-text)]">(disponible en POS)</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={form.visible} onChange={e => setForm(f => ({ ...f, visible: e.target.checked }))} className="w-4 h-4 rounded border-[var(--color-border)]" />
                      <span className="text-[var(--color-text-dark)]">Visible</span>
                      <span className="text-xs text-[var(--color-text)]">(aparece en tienda pública)</span>
                    </label>
                  </div>

                  {modal.id && (
                    <div>
                      <label className="label">Imagen</label>
                      <div className="flex items-center gap-3">
                        {currentProduct?.images?.[0] && <img src={currentProduct.images[0]} className="w-16 h-16 rounded-lg object-cover" />}
                        <ImageUpload productId={modal.id} onUploaded={() => queryClient.invalidateQueries({ queryKey: ['products'] })} />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button type="submit" disabled={saveMutation.isPending} className="btn-primary flex-1">{saveMutation.isPending ? 'Guardando...' : 'Guardar'}</button>
                    <button type="button" onClick={() => setModal(null)} className="btn-secondary">Cancelar</button>
                  </div>
                </form>
              </>
            )}

            {modal.type === 'category' && (
              <>
                <h2 className="text-lg font-bold text-[var(--color-text-dark)]">{modal.id ? 'Editar categoría' : 'Nueva categoría'}</h2>
                <form onSubmit={(e) => { e.preventDefault(); catSaveMutation.mutate(catForm) }} className="space-y-3">
                  <div><label className="label">Nombre</label><input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} className="input" required /></div>
                  <div><label className="label">Descripción</label><input value={catForm.description} onChange={e => setCatForm(f => ({ ...f, description: e.target.value }))} className="input" /></div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" disabled={catSaveMutation.isPending} className="btn-primary flex-1">{catSaveMutation.isPending ? 'Guardando...' : 'Guardar'}</button>
                    <button type="button" onClick={() => setModal(null)} className="btn-secondary">Cancelar</button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

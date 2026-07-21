'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { getAuthStore } from '@/lib/store'
import { useParams } from 'next/navigation'
import { ImageUpload } from '@/components/ImageUpload'

import Link from 'next/link'

export default function InventoryPage() {
  const params = useParams(); const token = getAuthStore(params.slug as string)(s => s.token)!
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'products' | 'categories'>('products')
  const [modal, setModal] = useState<{ type: 'product' | 'category' | 'restock'; id: string | null } | null>(null)
  const [form, setForm] = useState({ name: '', price: '', stock: '', minStock: '', categoryId: '', description: '', active: true, visible: true })
  const [catForm, setCatForm] = useState({ name: '', description: '' })
  const [restockForm, setRestockForm] = useState({ quantity: '', reason: '' })
  const [search, setSearch] = useState('')
  const [newGroupForm, setNewGroupForm] = useState<{ name: string; options: Array<{ name: string; price: string }> } | null>(null)
  const [productModifiers, setProductModifiers] = useState<string[]>([])

  const { data: products } = useQuery({ queryKey: ['products', search], queryFn: () => api(`/api/admin/products?pageSize=500&search=${search}`, { token }) })
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api('/api/admin/categories', { token }) })
  const { data: modifierGroups } = useQuery({ queryKey: ['modifiers'], queryFn: () => api('/api/admin/modifiers', { token }) })

  const saveMutation = useMutation({
    mutationFn: async (body: any) => {
      let product: any
      if (modal?.id) {
        product = await api(`/api/admin/products/${modal.id}`, { method: 'PUT', body: JSON.stringify(body), token })
      } else {
        product = await api('/api/admin/products', { method: 'POST', body: JSON.stringify(body), token })
      }
      // Save modifier assignments
      const productId = product.id
      if (productId && modifierGroups) {
        // Remove all existing assignments, then add selected ones
        for (const g of modifierGroups) {
          if (!productModifiers.includes(g.id)) {
            await api(`/api/admin/modifiers/${g.id}/assign/${productId}`, { method: 'DELETE', token }).catch(() => {})
          }
        }
        const toAssign = productModifiers.filter(id => id)
        if (toAssign.length > 0) {
          for (const groupId of toAssign) {
            await api(`/api/admin/modifiers/${groupId}/assign`, { method: 'POST', body: JSON.stringify({ productIds: [productId] }), token }).catch(() => {})
          }
        }
      }
      return product
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

  const restockMutation = useMutation({
    mutationFn: (body: { productId: string; quantity: number; reason?: string }) =>
      api('/api/admin/inventory/restock', { method: 'POST', body: JSON.stringify({ items: [body] }), token }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); setModal(null) },
  })

  const openNewProduct = () => { setForm({ name: '', price: '', stock: '', minStock: '', categoryId: '', description: '', active: true, visible: true }); setProductModifiers([]); setNewGroupForm(null); setModal({ type: 'product', id: null }) }
  const openEditProduct = (p: any) => {
    setForm({ name: p.name, price: String(Number(p.price)), stock: String(p.stock), minStock: String(p.minStock), categoryId: p.categoryId, description: p.description ?? '', active: p.active, visible: p.visible })
    setNewGroupForm(null)
    // Load product's current modifier groups
    api(`/api/admin/products/${p.id}/modifiers`, { token }).then((mods: any[]) => {
      setProductModifiers(mods.map((m: any) => m.id))
    }).catch(() => setProductModifiers([]))
    setModal({ type: 'product', id: p.id })
  }
  const openRestock = (p: any) => { setRestockForm({ quantity: '', reason: '' }); setModal({ type: 'restock', id: p.id }) }
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
          <div className="mb-4 flex gap-2 flex-wrap">
            <button onClick={openNewProduct} className="btn-primary">+ Nuevo producto</button>
            <Link href={`/t/${params.slug}/admin/bulk`} className="px-4 py-2 text-sm border border-[var(--color-border)] rounded-lg text-[var(--color-text)] hover:bg-gray-50 transition-colors">
              📋 Carga masiva
            </Link>
          </div>
          <div className="mb-4">
            <input
              type="text"
              placeholder="Buscar producto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input w-full md:w-80"
            />
          </div>

          {/* Desktop table */}
          <div className="hidden md:block card overflow-hidden">
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
                        <button onClick={() => openRestock(p)} className="text-xs px-2 py-1 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">+Stock</button>
                        <button onClick={() => openEditProduct(p)} className="btn-secondary text-xs px-2 py-1">Editar</button>
                        <button onClick={() => { if(confirm('¿Eliminar?')) deleteMutation.mutate(p.id) }} className="btn-danger">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {products?.items?.map((p: any) => (
              <div key={p.id} className="card p-4">
                <div className="flex items-start gap-3">
                  {p.images?.[0] ? <img src={p.images[0]} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" /> : <span className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-lg flex-shrink-0">📦</span>}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[var(--color-text-dark)] truncate">{p.name}</p>
                    <p className="text-xs text-[var(--color-text)]">{getCategoryName(p.categoryId)}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-sm font-bold text-[var(--color-primary)]">${Number(p.price).toFixed(2)}</span>
                      <span className="text-xs text-[var(--color-text)]">Stock: <strong className={p.stock <= p.minStock ? 'text-amber-600' : ''}>{p.stock}</strong></span>
                      {p.stock <= p.minStock && <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full">Bajo</span>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--color-border)]">
                  <button onClick={() => openRestock(p)} className="flex-1 text-xs py-2 rounded-lg bg-blue-50 text-blue-600 font-medium hover:bg-blue-100 transition-colors">+ Reabastecer</button>
                  <button onClick={() => openEditProduct(p)} className="flex-1 text-xs py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-dark)] font-medium hover:bg-gray-100 transition-colors">Editar</button>
                  <button onClick={() => { if(confirm('¿Eliminar?')) deleteMutation.mutate(p.id) }} className="text-xs py-2 px-3 rounded-lg bg-red-50 text-red-600 font-medium hover:bg-red-100 transition-colors">🗑️</button>
                </div>
              </div>
            ))}
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
                        <ImageUpload productId={modal.id} token={token} onUploaded={() => queryClient.invalidateQueries({ queryKey: ['products'] })} />
                      </div>
                    </div>
                  )}

                  {/* Modifier groups */}
                  <div>
                    <label className="label">Modificadores</label>
                    {modifierGroups?.length > 0 ? (
                      <div className="space-y-2">
                        {modifierGroups.filter((g: any) => g.active).map((g: any) => (
                          <label key={g.id} className="flex items-center justify-between py-2 px-3 rounded-lg border border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-surface)]">
                            <div className="flex items-center gap-2">
                              <input type="checkbox" checked={productModifiers.includes(g.id)}
                                onChange={e => setProductModifiers(prev => e.target.checked ? [...prev, g.id] : prev.filter(id => id !== g.id))}
                                className="w-4 h-4 rounded border-[var(--color-border)]" />
                              <span className="text-sm text-[var(--color-text-dark)]">{g.name}</span>
                            </div>
                            <span className="text-xs text-[var(--color-text)]">{g.options?.length ?? 0} opciones</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--color-text)]">No hay grupos de modificadores creados</p>
                    )}
                    {!newGroupForm ? (
                      <button type="button" onClick={() => setNewGroupForm({ name: '', options: [{ name: '', price: '' }] })}
                        className="text-xs text-[var(--color-primary)] hover:underline mt-2">+ Crear nuevo grupo</button>
                    ) : (
                      <div className="mt-3 p-3 border border-[var(--color-border)] rounded-lg space-y-2">
                        <input value={newGroupForm.name} onChange={e => setNewGroupForm(f => f ? { ...f, name: e.target.value } : f)} className="input text-sm" placeholder="Nombre del grupo (ej: Extras café)" />
                        {newGroupForm.options.map((opt, i) => (
                          <div key={i} className="flex gap-2">
                            <input value={opt.name} onChange={e => setNewGroupForm(f => f ? { ...f, options: f.options.map((o, j) => j === i ? { ...o, name: e.target.value } : o) } : f)} className="input text-sm flex-1" placeholder="Opción" />
                            <input type="number" step="0.01" value={opt.price} onChange={e => setNewGroupForm(f => f ? { ...f, options: f.options.map((o, j) => j === i ? { ...o, price: e.target.value } : o) } : f)} className="input text-sm w-20" placeholder="$" />
                          </div>
                        ))}
                        <button type="button" onClick={() => setNewGroupForm(f => f ? { ...f, options: [...f.options, { name: '', price: '' }] } : f)} className="text-xs text-[var(--color-primary)]">+ Agregar opción</button>
                        <div className="flex gap-2 pt-1">
                          <button type="button" onClick={async () => {
                            if (!newGroupForm.name) return
                            const group = await api('/api/admin/modifiers', { method: 'POST', body: JSON.stringify({ name: newGroupForm.name, multiple: true }), token })
                            for (const opt of newGroupForm.options.filter(o => o.name)) {
                              await api(`/api/admin/modifiers/${group.id}/options`, { method: 'POST', body: JSON.stringify({ name: opt.name, price: Number(opt.price) || 0 }), token })
                            }
                            setProductModifiers(prev => [...prev, group.id])
                            setNewGroupForm(null)
                            queryClient.invalidateQueries({ queryKey: ['modifiers'] })
                          }} className="btn-primary text-xs px-3 py-1">Crear grupo</button>
                          <button type="button" onClick={() => setNewGroupForm(null)} className="btn-secondary text-xs px-3 py-1">Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>

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

            {modal.type === 'restock' && (() => {
              const product = products?.items?.find((p: any) => p.id === modal.id)
              return (
                <>
                  <h2 className="text-lg font-bold text-[var(--color-text-dark)]">Reabastecer stock</h2>
                  {product && (
                    <div className="p-3 bg-[var(--color-surface)] rounded-lg">
                      <p className="font-medium text-[var(--color-text-dark)]">{product.name}</p>
                      <p className="text-sm text-[var(--color-text)]">Stock actual: <strong>{product.stock}</strong></p>
                    </div>
                  )}
                  <form onSubmit={(e) => { e.preventDefault(); restockMutation.mutate({ productId: modal.id!, quantity: Number(restockForm.quantity), ...(restockForm.reason && { reason: restockForm.reason }) }) }} className="space-y-3">
                    <div>
                      <label className="label">Cantidad a agregar</label>
                      <input type="number" min="1" value={restockForm.quantity} onChange={e => setRestockForm(f => ({ ...f, quantity: e.target.value }))} className="input" placeholder="Ej: 50" required autoFocus />
                      {product && restockForm.quantity && (
                        <p className="text-xs text-[var(--color-text)] mt-1">
                          Nuevo stock: <strong className="text-green-600">{product.stock + Number(restockForm.quantity)}</strong>
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="label">Razón (opcional)</label>
                      <input value={restockForm.reason} onChange={e => setRestockForm(f => ({ ...f, reason: e.target.value }))} className="input" placeholder="Ej: Reabastecimiento semanal" />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button type="submit" disabled={restockMutation.isPending || !restockForm.quantity} className="btn-primary flex-1">{restockMutation.isPending ? 'Procesando...' : 'Reabastecer'}</button>
                      <button type="button" onClick={() => setModal(null)} className="btn-secondary">Cancelar</button>
                    </div>
                    {restockMutation.isError && <p className="text-red-500 text-xs">{(restockMutation.error as Error).message}</p>}
                  </form>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

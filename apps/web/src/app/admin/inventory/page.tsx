'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

export default function InventoryPage() {
  const token = useAuthStore(s => s.token)!
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', price: '', stock: '', minStock: '', categoryId: '', description: '' })

  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => api('/api/admin/products?pageSize=100', { token }) })
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api('/api/admin/categories', { token }) })

  const saveMutation = useMutation({
    mutationFn: (body: any) => {
      if (editing) return api(`/api/admin/products/${editing}`, { method: 'PUT', body: JSON.stringify(body), token })
      return api('/api/admin/products', { method: 'POST', body: JSON.stringify(body), token })
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); resetForm() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/admin/products/${id}`, { method: 'DELETE', token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })

  const resetForm = () => { setEditing(null); setForm({ name: '', price: '', stock: '', minStock: '', categoryId: '', description: '' }) }

  const startEdit = (p: any) => {
    setEditing(p.id)
    setForm({ name: p.name, price: String(Number(p.price)), stock: String(p.stock), minStock: String(p.minStock), categoryId: p.categoryId, description: p.description ?? '' })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    saveMutation.mutate({ ...form, price: Number(form.price), stock: Number(form.stock), minStock: Number(form.minStock) })
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Inventario</h1>
        {!editing && <button onClick={() => setEditing('new')} className="bg-primary text-white px-4 py-2 rounded text-sm">+ Producto</button>}
      </div>

      {editing && (
        <form onSubmit={handleSubmit} className="bg-white p-4 rounded shadow mb-4 grid grid-cols-2 gap-3">
          <input placeholder="Nombre" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="border rounded p-2" required />
          <input placeholder="Precio" type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} className="border rounded p-2" required />
          <input placeholder="Stock" type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} className="border rounded p-2" required />
          <input placeholder="Stock mínimo" type="number" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))} className="border rounded p-2" />
          <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} className="border rounded p-2" required>
            <option value="">Categoría...</option>
            {categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input placeholder="Descripción" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="border rounded p-2" />
          <div className="col-span-2 flex gap-2">
            <button type="submit" className="flex-1 bg-primary text-white rounded p-2">{editing === 'new' ? 'Crear' : 'Guardar'}</button>
            <button type="button" onClick={resetForm} className="px-4 bg-gray-200 rounded p-2">Cancelar</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="p-3 text-left">Producto</th><th className="p-3">Precio</th><th className="p-3">Stock</th><th className="p-3">Estado</th><th className="p-3">Acciones</th></tr></thead>
          <tbody>
            {products?.items?.map((p: any) => (
              <tr key={p.id} className="border-t">
                <td className="p-3">{p.name}</td>
                <td className="p-3 text-center">${Number(p.price).toFixed(2)}</td>
                <td className="p-3 text-center">{p.stock}</td>
                <td className="p-3 text-center">{p.stock <= p.minStock ? <span className="text-red-500 text-xs">⚠️ Bajo</span> : <span className="text-green-500 text-xs">OK</span>}</td>
                <td className="p-3 text-center space-x-2">
                  <button onClick={() => startEdit(p)} className="text-blue-500 text-xs hover:underline">Editar</button>
                  <button onClick={() => { if(confirm('¿Eliminar?')) deleteMutation.mutate(p.id) }} className="text-red-500 text-xs hover:underline">Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

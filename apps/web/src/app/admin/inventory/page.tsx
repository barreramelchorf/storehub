'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

export default function InventoryPage() {
  const token = useAuthStore(s => s.token)!
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', price: '', stock: '', minStock: '', categoryId: '', description: '' })

  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => api('/api/admin/products?pageSize=100', { token }) })
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api('/api/admin/categories', { token }) })

  const createProduct = useMutation({
    mutationFn: (body: any) => api('/api/admin/products', { method: 'POST', body: JSON.stringify(body), token }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); setShowForm(false); setForm({ name: '', price: '', stock: '', minStock: '', categoryId: '', description: '' }) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createProduct.mutate({ ...form, price: Number(form.price), stock: Number(form.stock), minStock: Number(form.minStock) })
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Inventario</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-primary text-white px-4 py-2 rounded text-sm">+ Producto</button>
      </div>

      {showForm && (
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
          <button type="submit" className="col-span-2 bg-primary text-white rounded p-2">Guardar</button>
        </form>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="p-3 text-left">Producto</th><th className="p-3">Precio</th><th className="p-3">Stock</th><th className="p-3">Estado</th></tr></thead>
          <tbody>
            {products?.items?.map((p: any) => (
              <tr key={p.id} className="border-t">
                <td className="p-3">{p.name}</td>
                <td className="p-3 text-center">${Number(p.price).toFixed(2)}</td>
                <td className="p-3 text-center">{p.stock}</td>
                <td className="p-3 text-center">{p.stock <= p.minStock ? <span className="text-red-500 text-xs">⚠️ Bajo</span> : <span className="text-green-500 text-xs">OK</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

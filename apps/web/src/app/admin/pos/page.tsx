'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

interface CartItem { productId: string; name: string; price: number; quantity: number }

export default function POSPage() {
  const token = useAuthStore(s => s.token)!
  const queryClient = useQueryClient()
  const [cart, setCart] = useState<CartItem[]>([])
  const [discount, setDiscount] = useState(0)
  const [tip, setTip] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<string>('cash')
  const [search, setSearch] = useState('')

  const { data } = useQuery({ queryKey: ['products', search], queryFn: () => api(`/api/admin/products?search=${search}`, { token }) })

  const saleMutation = useMutation({
    mutationFn: (body: any) => api('/api/admin/sales', { method: 'POST', body: JSON.stringify(body), token }),
    onSuccess: () => { setCart([]); setDiscount(0); setTip(0); queryClient.invalidateQueries({ queryKey: ['products'] }) },
  })

  const addToCart = (p: any) => {
    setCart(prev => {
      const existing = prev.find(i => i.productId === p.id)
      if (existing) return prev.map(i => i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { productId: p.id, name: p.name, price: Number(p.price), quantity: 1 }]
    })
  }

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0) - discount + tip

  const handleSale = () => {
    saleMutation.mutate({
      items: cart.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.price })),
      paymentMethod, discount, tip,
    })
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-5rem)]">
      <div className="flex-1 flex flex-col">
        <input placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} className="border rounded p-2 mb-3" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 overflow-y-auto flex-1">
          {data?.items?.map((p: any) => (
            <button key={p.id} onClick={() => addToCart(p)} className="bg-white p-3 rounded shadow text-left hover:ring-2 ring-primary" disabled={p.stock <= 0}>
              <p className="font-medium text-sm truncate">{p.name}</p>
              <p className="text-primary font-bold">${Number(p.price).toFixed(2)}</p>
              <p className="text-xs text-gray-400">Stock: {p.stock}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="w-80 bg-white rounded-lg shadow p-4 flex flex-col">
        <h2 className="font-bold mb-3">Venta</h2>
        <div className="flex-1 overflow-y-auto space-y-2">
          {cart.map(item => (
            <div key={item.productId} className="flex justify-between items-center text-sm">
              <span>{item.name} x{item.quantity}</span>
              <span>${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="border-t pt-3 mt-3 space-y-2">
          <div className="flex gap-2">
            <input type="number" placeholder="Descuento" value={discount || ''} onChange={e => setDiscount(Number(e.target.value))} className="border rounded p-1 w-1/2 text-sm" />
            <input type="number" placeholder="Propina" value={tip || ''} onChange={e => setTip(Number(e.target.value))} className="border rounded p-1 w-1/2 text-sm" />
          </div>
          <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full border rounded p-1 text-sm">
            <option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option>
          </select>
          <p className="text-xl font-bold text-right">Total: ${total.toFixed(2)}</p>
          <button onClick={handleSale} disabled={!cart.length || saleMutation.isPending} className="w-full bg-primary text-white rounded p-2 font-medium disabled:opacity-50">
            {saleMutation.isPending ? 'Procesando...' : 'Registrar venta'}
          </button>
          {saleMutation.isError && <p className="text-red-500 text-xs">{(saleMutation.error as Error).message}</p>}
        </div>
      </div>
    </div>
  )
}

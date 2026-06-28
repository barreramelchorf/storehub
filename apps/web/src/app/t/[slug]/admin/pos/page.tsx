'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

interface CartItem { productId: string; name: string; price: number; quantity: number }
const CART_KEY = 'storehub-cart'
function loadCart(): CartItem[] { try { return JSON.parse(localStorage.getItem(CART_KEY) ?? '[]') } catch { return [] } }
function saveCart(cart: CartItem[]) { localStorage.setItem(CART_KEY, JSON.stringify(cart)) }

export default function POSPage() {
  const token = useAuthStore(s => s.token)!
  const queryClient = useQueryClient()
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartLoaded, setCartLoaded] = useState(false)
  const [discount, setDiscount] = useState(0)
  const [tip, setTip] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [search, setSearch] = useState('')
  const [saleDate, setSaleDate] = useState('')
  const [mobileView, setMobileView] = useState<'products' | 'cart'>('products')

  // Pre-fill today's date using tenant timezone (not user's system timezone)
  useEffect(() => {
    const tz = process.env.NEXT_PUBLIC_TIMEZONE ?? 'America/Mexico_City'
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz }) // en-CA gives YYYY-MM-DD
    setSaleDate(today)
  }, [])

  useEffect(() => { setCart(loadCart()); setCartLoaded(true) }, [])
  useEffect(() => { if (cartLoaded) saveCart(cart) }, [cart, cartLoaded])

  const { data } = useQuery({ queryKey: ['products', search], queryFn: () => api(`/api/admin/products?search=${search}`, { token }) })

  const saleMutation = useMutation({
    mutationFn: (body: any) => api('/api/admin/sales', { method: 'POST', body: JSON.stringify(body), token }),
    onSuccess: () => { setCart([]); setDiscount(0); setTip(0); setSaleDate(''); setMobileView('products'); queryClient.invalidateQueries({ queryKey: ['products'] }) },
  })

  const addToCart = (p: any) => {
    setCart(prev => {
      const existing = prev.find(i => i.productId === p.id)
      if (existing) return prev.map(i => i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { productId: p.id, name: p.name, price: Number(p.price), quantity: 1 }]
    })
  }

  const removeFromCart = (productId: string) => setCart(prev => prev.filter(i => i.productId !== productId))
  const updateQty = (productId: string, qty: number) => {
    if (qty <= 0) return removeFromCart(productId)
    setCart(prev => prev.map(i => i.productId === productId ? { ...i, quantity: qty } : i))
  }

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0)
  const total = subtotal - discount + tip
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0)

  const productsGrid = (
    <div className="flex flex-col h-full">
      <input placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} className="input mb-4" />
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto flex-1">
        {data?.items?.map((p: any) => (
          <button key={p.id} onClick={() => addToCart(p)} disabled={p.stock <= 0}
            className="card text-left hover:border-[var(--color-primary)] hover:shadow-md transition-all disabled:opacity-40 overflow-hidden flex flex-col">
            {p.images?.[0] ? <img src={p.images[0]} alt={p.name} className="w-full h-20 md:h-24 object-cover flex-shrink-0" /> : <div className="w-full h-20 md:h-24 bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">📦</div>}
            <div className="p-2 md:p-3 flex-shrink-0">
              <p className="font-medium text-xs md:text-sm text-[var(--color-text-dark)] line-clamp-2">{p.name}</p>
              <p className="text-[var(--color-primary)] font-bold text-sm">${Number(p.price).toFixed(2)}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )

  const cartPanel = (
    <div className="flex flex-col h-full">
      <h2 className="font-semibold text-[var(--color-text-dark)] mb-4">Resumen de venta</h2>
      <div className="flex-1 overflow-y-auto space-y-3">
        {cart.map(item => (
          <div key={item.productId} className="flex items-center justify-between py-2 border-b border-[var(--color-border)]">
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--color-text-dark)]">{item.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <button onClick={() => updateQty(item.productId, item.quantity - 1)} className="w-7 h-7 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] text-sm hover:bg-gray-100">−</button>
                <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                <button onClick={() => updateQty(item.productId, item.quantity + 1)} className="w-7 h-7 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] text-sm hover:bg-gray-100">+</button>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">${(item.price * item.quantity).toFixed(2)}</p>
              <button onClick={() => removeFromCart(item.productId)} className="btn-danger text-xs mt-1">Quitar</button>
            </div>
          </div>
        ))}
        {cart.length === 0 && <p className="text-sm text-[var(--color-text)] text-center py-8">Sin productos en la venta</p>}
      </div>

      <div className="border-t border-[var(--color-border)] pt-4 mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Descuento</label><input type="number" value={discount || ''} onChange={e => setDiscount(Number(e.target.value))} className="input" /></div>
          <div><label className="label">Propina</label><input type="number" value={tip || ''} onChange={e => setTip(Number(e.target.value))} className="input" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Método de pago</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="input">
              <option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option>
            </select>
          </div>
          <div><label className="label">Fecha</label>
            <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} className="input" />
          </div>
        </div>
        <div className="flex justify-between text-sm text-[var(--color-text)]"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
        {discount > 0 && <div className="flex justify-between text-sm text-green-600"><span>Descuento</span><span>-${discount.toFixed(2)}</span></div>}
        {tip > 0 && <div className="flex justify-between text-sm text-[var(--color-text)]"><span>Propina</span><span>+${tip.toFixed(2)}</span></div>}
        <div className="flex justify-between font-bold text-lg text-[var(--color-text-dark)] border-t border-[var(--color-border)] pt-3">
          <span>Total</span><span>${total.toFixed(2)}</span>
        </div>
        <p className="text-xs text-[var(--color-text)] text-right">{itemCount} producto(s)</p>
        <button onClick={() => saleMutation.mutate({ items: cart.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.price })), paymentMethod, discount, tip, ...(saleDate && { saleDate: new Date(saleDate).toISOString() }) })}
          disabled={!cart.length || saleMutation.isPending} className="btn-primary w-full py-3 text-base">
          {saleMutation.isPending ? 'Procesando...' : 'Cobrar'}
        </button>
        {saleMutation.isError && <p className="text-red-500 text-xs text-center">{(saleMutation.error as Error).message}</p>}
        {saleMutation.isSuccess && <p className="text-green-600 text-xs text-center">✓ Venta registrada</p>}
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop layout */}
      <div className="hidden md:flex gap-6 h-[calc(100vh-6rem)]">
        <div className="flex-1 flex flex-col">
          <h1 className="text-2xl font-bold text-[var(--color-text-dark)] mb-4">Punto de Venta</h1>
          {productsGrid}
        </div>
        <div className="w-96 card p-6 flex flex-col">
          {cartPanel}
        </div>
      </div>

      {/* Mobile layout */}
      <div className="md:hidden flex flex-col h-[calc(100vh-7rem)]">
        {mobileView === 'products' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <h1 className="text-xl font-bold text-[var(--color-text-dark)] mb-3">Punto de Venta</h1>
            {productsGrid}
          </div>
        )}
        {mobileView === 'cart' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <button onClick={() => setMobileView('products')} className="btn-secondary mb-3 self-start">← Productos</button>
            {cartPanel}
          </div>
        )}

        {/* Floating cart button (mobile) */}
        {mobileView === 'products' && (
          <button onClick={() => setMobileView('cart')}
            className="fixed bottom-6 right-6 btn-primary rounded-full px-5 py-3 shadow-lg flex items-center gap-2 text-base z-30">
            🛒 <span className="font-bold">{itemCount}</span> · ${total.toFixed(2)}
          </button>
        )}
      </div>
    </>
  )
}

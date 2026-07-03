'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { getAuthStore } from '@/lib/store'
import { useParams } from 'next/navigation'

interface CartItem { productId: string; name: string; price: number; quantity: number }
const CART_KEY = 'storehub-cart'
function loadCart(): CartItem[] { try { return JSON.parse(localStorage.getItem(CART_KEY) ?? '[]') } catch { return [] } }
function saveCart(cart: CartItem[]) { localStorage.setItem(CART_KEY, JSON.stringify(cart)) }

export default function POSPage() {
  const params = useParams(); const token = getAuthStore(params.slug as string)(s => s.token)!
  const queryClient = useQueryClient()
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartLoaded, setCartLoaded] = useState(false)
  const [discount, setDiscount] = useState(0)
  const [tip, setTip] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [search, setSearch] = useState('')
  const [saleDate, setSaleDate] = useState('')
  const [mobileCartOpen, setMobileCartOpen] = useState(false)

  useEffect(() => {
    const tz = process.env.NEXT_PUBLIC_TIMEZONE ?? 'America/Mexico_City'
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })
    setSaleDate(today)
  }, [])

  useEffect(() => { setCart(loadCart()); setCartLoaded(true) }, [])
  useEffect(() => { if (cartLoaded) saveCart(cart) }, [cart, cartLoaded])

  const { data } = useQuery({ queryKey: ['products', search], queryFn: () => api(`/api/admin/products?search=${search}&pageSize=500`, { token }) })

  const saleMutation = useMutation({
    mutationFn: (body: any) => api('/api/admin/sales', { method: 'POST', body: JSON.stringify(body), token }),
    onSuccess: () => { setCart([]); setDiscount(0); setTip(0); setMobileCartOpen(false); queryClient.invalidateQueries({ queryKey: ['products'] }) },
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

  const handleCheckout = () => {
    saleMutation.mutate({
      items: cart.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.price })),
      paymentMethod, discount, tip,
      ...(saleDate && { saleDate: new Date(saleDate).toISOString() }),
    })
  }

  // Products grid with inline cart controls
  const productsGrid = (
    <div className="flex flex-col h-full min-h-0">
      <input placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} className="input mb-4 flex-shrink-0" />
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto flex-1 min-h-0">
        {data?.items?.map((p: any) => {
          const inCart = cart.find(i => i.productId === p.id)
          return (
            <div key={p.id} className="card overflow-hidden flex flex-col">
              <div className="relative">
                {p.images?.[0] ? <img src={p.images[0]} alt={p.name} className="w-full h-24 md:h-28 object-cover" /> : <div className="w-full h-24 md:h-28 bg-gray-100 flex items-center justify-center text-2xl">📦</div>}
                {inCart && (
                  <span className="absolute top-1 right-1 bg-[var(--color-primary)] text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{inCart.quantity}</span>
                )}
              </div>
              <div className="p-2 flex-1 flex flex-col justify-between">
                <p className="font-medium text-xs text-[var(--color-text-dark)] line-clamp-2">{p.name}</p>
                <p className="text-[var(--color-primary)] font-bold text-sm mt-1">${Number(p.price).toFixed(2)}</p>
              </div>
              <div className="px-2 pb-2">
                {p.stock <= 0 ? (
                  <span className="text-xs text-red-500">Agotado</span>
                ) : inCart ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(p.id, inCart.quantity - 1)} className="w-7 h-7 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-sm flex items-center justify-center hover:bg-gray-100">−</button>
                      <span className="text-sm font-bold w-5 text-center">{inCart.quantity}</span>
                      <button onClick={() => updateQty(p.id, inCart.quantity + 1)} className="w-7 h-7 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-sm flex items-center justify-center hover:bg-gray-100">+</button>
                    </div>
                    <button onClick={() => removeFromCart(p.id)} className="text-xs text-red-500 hover:text-red-700">✕</button>
                  </div>
                ) : (
                  <button onClick={() => addToCart(p)} className="w-full py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-xs font-medium hover:opacity-90 transition-opacity">
                    Agregar
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  // Cart panel (shared between desktop sidebar and mobile overlay)
  const cartContent = (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="font-semibold text-[var(--color-text-dark)] text-lg">Resumen de venta</h2>
        {cart.length > 0 && <span className="text-xs text-[var(--color-text)] bg-[var(--color-surface)] px-2 py-1 rounded-full">{itemCount} producto(s)</span>}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-2">
        {cart.length === 0 && (
          <div className="text-center py-8">
            <p className="text-3xl mb-2">🛒</p>
            <p className="text-sm text-[var(--color-text)]">Sin productos en la venta</p>
          </div>
        )}
        {cart.map(item => (
          <div key={item.productId} className="flex items-center justify-between py-3 border-b border-[var(--color-border)] last:border-0">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--color-text-dark)] truncate">{item.name}</p>
              <p className="text-xs text-[var(--color-text)]">${item.price.toFixed(2)} c/u</p>
            </div>
            <div className="flex items-center gap-2 ml-3">
              <button onClick={() => updateQty(item.productId, item.quantity - 1)} className="w-6 h-6 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-xs flex items-center justify-center hover:bg-gray-100">−</button>
              <span className="text-sm font-bold w-4 text-center">{item.quantity}</span>
              <button onClick={() => updateQty(item.productId, item.quantity + 1)} className="w-6 h-6 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-xs flex items-center justify-center hover:bg-gray-100">+</button>
            </div>
            <p className="text-sm font-bold ml-3 w-16 text-right">${(item.price * item.quantity).toFixed(2)}</p>
          </div>
        ))}
      </div>

      {cart.length > 0 && (
        <div className="border-t border-[var(--color-border)] pt-4 mt-4 space-y-3 flex-shrink-0">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Descuento</label><input type="number" value={discount || ''} onChange={e => setDiscount(Number(e.target.value))} className="input" placeholder="$0" /></div>
            <div><label className="label">Propina</label><input type="number" value={tip || ''} onChange={e => setTip(Number(e.target.value))} className="input" placeholder="$0" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Pago</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="input">
                <option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option>
              </select>
            </div>
            <div><label className="label">Fecha</label>
              <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} className="input" />
            </div>
          </div>

          <div className="space-y-1 pt-2">
            <div className="flex justify-between text-sm text-[var(--color-text)]"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
            {discount > 0 && <div className="flex justify-between text-sm text-green-600"><span>Descuento</span><span>-${discount.toFixed(2)}</span></div>}
            {tip > 0 && <div className="flex justify-between text-sm text-[var(--color-text)]"><span>Propina</span><span>+${tip.toFixed(2)}</span></div>}
          </div>

          <div className="flex justify-between items-center font-bold text-lg text-[var(--color-text-dark)] border-t border-[var(--color-border)] pt-3">
            <span>Total</span>
            <span className="text-[var(--color-primary)]">${total.toFixed(2)}</span>
          </div>
          <p className="text-xs text-[var(--color-text)] text-right">{itemCount} producto(s) · {cart.length} distinto(s)</p>

          <button onClick={handleCheckout} disabled={!cart.length || saleMutation.isPending}
            className="w-full py-3 rounded-lg bg-[var(--color-primary)] text-white font-medium text-base hover:opacity-90 transition-opacity disabled:opacity-50">
            {saleMutation.isPending ? 'Procesando...' : 'Cobrar'}
          </button>
          <button onClick={() => setCart([])} className="w-full py-2 text-xs text-[var(--color-text)] hover:text-red-500 transition-colors">
            Vaciar carrito
          </button>
          {saleMutation.isError && <p className="text-red-500 text-xs text-center">{(saleMutation.error as Error).message}</p>}
          {saleMutation.isSuccess && <p className="text-green-600 text-xs text-center font-medium">✓ Venta registrada</p>}
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Desktop layout */}
      <div className="hidden lg:flex gap-6 h-[calc(100vh-6rem)]">
        <div className="flex-1 flex flex-col min-h-0">
          <h1 className="text-2xl font-bold text-[var(--color-text-dark)] mb-4 flex-shrink-0">Punto de Venta</h1>
          {productsGrid}
        </div>
        <div className="w-96 flex-shrink-0">
          <div className="sticky top-0 card p-5 h-[calc(100vh-6rem)] flex flex-col">
            {cartContent}
          </div>
        </div>
      </div>

      {/* Mobile layout */}
      <div className="lg:hidden flex flex-col h-[calc(100vh-7rem)]">
        <h1 className="text-xl font-bold text-[var(--color-text-dark)] mb-3 flex-shrink-0">Punto de Venta</h1>
        {productsGrid}

        {/* Floating cart bar */}
        {itemCount > 0 && !mobileCartOpen && (
          <button onClick={() => setMobileCartOpen(true)}
            className="fixed bottom-6 left-4 right-4 bg-[var(--color-primary)] text-white py-3.5 px-6 rounded-xl shadow-lg flex items-center justify-between z-30 hover:opacity-90 transition-opacity">
            <div className="flex items-center gap-2">
              <span className="text-lg">🛒</span>
              <span className="font-medium">{itemCount} producto(s)</span>
            </div>
            <span className="font-bold text-lg">${total.toFixed(2)}</span>
          </button>
        )}

        {/* Mobile cart overlay */}
        {mobileCartOpen && (
          <div className="fixed inset-0 z-50 bg-white flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)] flex-shrink-0">
              <h2 className="text-lg font-bold text-[var(--color-text-dark)]">Resumen de venta</h2>
              <button onClick={() => setMobileCartOpen(false)} className="text-2xl text-[var(--color-text)] hover:text-[var(--color-text-dark)]">✕</button>
            </div>
            <div className="flex-1 p-4 min-h-0 overflow-hidden">
              {cartContent}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

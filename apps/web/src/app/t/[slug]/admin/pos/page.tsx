'use client'
import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { getAuthStore } from '@/lib/store'
import { useParams } from 'next/navigation'

interface CartItem { productId: string; name: string; price: number; quantity: number; modifiers?: Array<{ id: string; name: string; price: number }> }
interface Comanda { id: string; name: string; cart: CartItem[] }
interface ComandasState { comandas: Comanda[]; activeId: string }

const CART_KEY = 'storehub-cart'
const COMANDAS_KEY = 'storehub-comandas'

// Legacy single-cart helpers (used when multicomanda is OFF)
function loadCart(): CartItem[] { try { return JSON.parse(localStorage.getItem(CART_KEY) ?? '[]') } catch { return [] } }
function saveCart(cart: CartItem[]) { localStorage.setItem(CART_KEY, JSON.stringify(cart)) }

// Multi-comanda helpers
function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function loadComandas(): ComandasState {
  try {
    const raw = JSON.parse(localStorage.getItem(COMANDAS_KEY) ?? 'null')
    if (raw && raw.comandas?.length > 0) return raw
  } catch {}
  const initial: Comanda = { id: generateId(), name: 'Comanda 1', cart: [] }
  return { comandas: [initial], activeId: initial.id }
}
function saveComandas(state: ComandasState) { localStorage.setItem(COMANDAS_KEY, JSON.stringify(state)) }

export default function POSPage() {
  const params = useParams(); const token = getAuthStore(params.slug as string)(s => s.token)!
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const [discount, setDiscount] = useState(0)
  const [tip, setTip] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [saleDate, setSaleDate] = useState('')

  // Multicomanda state
  const [comandasState, setComandasState] = useState<ComandasState>({ comandas: [], activeId: '' })
  const [comandasLoaded, setComandasLoaded] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const renameRef = useRef<HTMLInputElement>(null)

  // Single cart state (used when multicomanda OFF)
  const [singleCart, setSingleCart] = useState<CartItem[]>([])
  const [singleCartLoaded, setSingleCartLoaded] = useState(false)

  // Modifier modal state
  const [modifierModal, setModifierModal] = useState<{ product: any; groups: any[] } | null>(null)
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, boolean>>({})

  // Load tenant config for multicomanda flag
  const { data: tenantConfig } = useQuery({
    queryKey: ['tenant-config'],
    queryFn: () => api('/api/public/info', { token }),
    enabled: !!token,
  })
  const multicomandaEnabled = tenantConfig?.config?.modules?.multicomanda ?? false
  const modifiersEnabled = tenantConfig?.config?.modules?.modifiers ?? false

  // Initialize date
  useEffect(() => {
    const tz = process.env.NEXT_PUBLIC_TIMEZONE ?? 'America/Mexico_City'
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })
    setSaleDate(today)
  }, [])

  // Load single cart
  useEffect(() => { setSingleCart(loadCart()); setSingleCartLoaded(true) }, [])
  useEffect(() => { if (singleCartLoaded) saveCart(singleCart) }, [singleCart, singleCartLoaded])

  // Load multicomanda state
  useEffect(() => { setComandasState(loadComandas()); setComandasLoaded(true) }, [])
  useEffect(() => { if (comandasLoaded) saveComandas(comandasState) }, [comandasState, comandasLoaded])

  // Focus rename input
  useEffect(() => { if (editingName && renameRef.current) renameRef.current.focus() }, [editingName])

  const { data } = useQuery({ queryKey: ['products', search], queryFn: () => api(`/api/admin/products?search=${search}&pageSize=500`, { token }) })

  // Determine active cart based on mode
  const activeComanda = comandasState.comandas.find(c => c.id === comandasState.activeId)
  const cart = multicomandaEnabled ? (activeComanda?.cart ?? []) : singleCart

  const setCart = (updater: CartItem[] | ((prev: CartItem[]) => CartItem[])) => {
    if (multicomandaEnabled) {
      setComandasState(prev => ({
        ...prev,
        comandas: prev.comandas.map(c =>
          c.id === prev.activeId
            ? { ...c, cart: typeof updater === 'function' ? updater(c.cart) : updater }
            : c
        ),
      }))
    } else {
      setSingleCart(typeof updater === 'function' ? updater(singleCart) : updater)
    }
  }

  const saleMutation = useMutation({
    mutationFn: (body: any) => api('/api/admin/sales', { method: 'POST', body: JSON.stringify(body), token }),
    onSuccess: () => {
      if (multicomandaEnabled) {
        // Close the active comanda
        setComandasState(prev => {
          const remaining = prev.comandas.filter(c => c.id !== prev.activeId)
          if (remaining.length === 0) {
            const newComanda: Comanda = { id: generateId(), name: 'Comanda 1', cart: [] }
            return { comandas: [newComanda], activeId: newComanda.id }
          }
          return { comandas: remaining, activeId: remaining[0].id }
        })
      } else {
        setSingleCart([])
      }
      setDiscount(0); setTip(0); setMobileCartOpen(false)
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })

  const addToCart = (p: any) => {
    if (modifiersEnabled && p.hasModifiers) {
      // Fetch modifiers and show modal
      api(`/api/admin/products/${p.id}/modifiers`, { token }).then(groups => {
        if (groups.length > 0) {
          setModifierModal({ product: p, groups })
          setSelectedModifiers({})
        } else {
          addToCartDirect(p)
        }
      }).catch(() => addToCartDirect(p))
      return
    }
    addToCartDirect(p)
  }

  const addToCartDirect = (p: any, modifiers?: Array<{ id: string; name: string; price: number }>) => {
    setCart(prev => {
      // If item has modifiers, it's always a new line (different combo = different item)
      if (modifiers && modifiers.length > 0) {
        const modKey = modifiers.map(m => m.id).sort().join(',')
        const existing = prev.find(i => i.productId === p.id && i.modifiers?.map(m => m.id).sort().join(',') === modKey)
        if (existing) return prev.map(i => i === existing ? { ...i, quantity: i.quantity + 1 } : i)
        const modifiersTotal = modifiers.reduce((s, m) => s + m.price, 0)
        return [...prev, { productId: p.id, name: p.name, price: Number(p.price) + modifiersTotal, quantity: 1, modifiers }]
      }
      // No modifiers — same logic as before
      const existing = prev.find(i => i.productId === p.id && !i.modifiers?.length)
      if (existing) return prev.map(i => i === existing ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { productId: p.id, name: p.name, price: Number(p.price), quantity: 1 }]
    })
  }

  const handleAddWithModifiers = () => {
    if (!modifierModal) return
    const selected = Object.entries(selectedModifiers)
      .filter(([_, v]) => v)
      .map(([id]) => {
        for (const g of modifierModal.groups) {
          const opt = g.options.find((o: any) => o.id === id)
          if (opt) return { id: opt.id, name: opt.name, price: Number(opt.price) }
        }
        return null
      })
      .filter(Boolean) as Array<{ id: string; name: string; price: number }>

    addToCartDirect(modifierModal.product, selected)
    setModifierModal(null)
  }

  const handleAddWithoutModifiers = () => {
    if (!modifierModal) return
    addToCartDirect(modifierModal.product)
    setModifierModal(null)
  }

  const removeFromCart = (index: number) => setCart(prev => prev.filter((_, i) => i !== index))
  const updateQty = (index: number, qty: number) => {
    if (qty <= 0) return removeFromCart(index)
    setCart(prev => prev.map((item, i) => i === index ? { ...item, quantity: qty } : item))
  }

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0)
  const total = subtotal - discount + tip
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0)

  const handleCheckout = () => {
    const tz = process.env.NEXT_PUBLIC_TIMEZONE ?? 'America/Mexico_City'
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })
    const isToday = saleDate === today || !saleDate

    saleMutation.mutate({
      items: cart.map(i => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.price,
        ...(i.modifiers?.length && { modifiers: i.modifiers }),
      })),
      paymentMethod, discount, tip,
      ...(!isToday && { saleDate: new Date(saleDate).toISOString() }),
    })
  }

  // Multicomanda actions
  const addComanda = () => {
    const num = comandasState.comandas.length + 1
    const newComanda: Comanda = { id: generateId(), name: `Comanda ${num}`, cart: [] }
    setComandasState(prev => ({ comandas: [...prev.comandas, newComanda], activeId: newComanda.id }))
  }

  const switchComanda = (id: string) => {
    setComandasState(prev => ({ ...prev, activeId: id }))
    setDiscount(0); setTip(0)
  }

  const renameComanda = (id: string, name: string) => {
    setComandasState(prev => ({
      ...prev,
      comandas: prev.comandas.map(c => c.id === id ? { ...c, name: name || c.name } : c),
    }))
    setEditingName(null)
  }

  const closeComanda = (id: string) => {
    setComandasState(prev => {
      const remaining = prev.comandas.filter(c => c.id !== id)
      if (remaining.length === 0) {
        const newComanda: Comanda = { id: generateId(), name: 'Comanda 1', cart: [] }
        return { comandas: [newComanda], activeId: newComanda.id }
      }
      const newActiveId = prev.activeId === id ? remaining[0].id : prev.activeId
      return { comandas: remaining, activeId: newActiveId }
    })
  }

  // Tabs UI component
  const comandaTabs = multicomandaEnabled ? (
    <div className="flex items-center gap-1 overflow-x-auto pb-2 mb-3 border-b border-[var(--color-border)] flex-shrink-0">
      {comandasState.comandas.map(c => (
        <div key={c.id} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${c.id === comandasState.activeId ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)]'}`}>
          {editingName === c.id ? (
            <input ref={renameRef} defaultValue={c.name} className="bg-transparent border-none outline-none w-20 text-xs"
              onBlur={e => renameComanda(c.id, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') renameComanda(c.id, (e.target as HTMLInputElement).value) }} />
          ) : (
            <>
              <span onClick={() => switchComanda(c.id)}>{c.name}</span>
              {c.id === comandasState.activeId && (
                <button onClick={(e) => { e.stopPropagation(); setEditingName(c.id) }} className="ml-0.5 opacity-60 hover:opacity-100">✏️</button>
              )}
            </>
          )}
          {c.cart.length > 0 && <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center ${c.id === comandasState.activeId ? 'bg-white/30' : 'bg-[var(--color-primary)] text-white'}`}>{c.cart.reduce((s, i) => s + i.quantity, 0)}</span>}
          {comandasState.comandas.length > 1 && (
            <button onClick={(e) => { e.stopPropagation(); closeComanda(c.id) }} className={`ml-1 text-xs opacity-50 hover:opacity-100 ${c.id === comandasState.activeId ? 'text-white' : 'text-[var(--color-text)]'}`}>✕</button>
          )}
        </div>
      ))}
      <button onClick={addComanda} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] whitespace-nowrap transition-colors">
        + Nueva
      </button>
    </div>
  ) : null

  // Products grid
  const productsGrid = (
    <div className="flex flex-col h-full min-h-0">
      <input placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} className="input mb-4 flex-shrink-0" />
      <div className="overflow-y-auto flex-1 min-h-0">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {data?.items?.map((p: any) => {
          const inCartItems = cart.filter(i => i.productId === p.id)
          const totalQty = inCartItems.reduce((s, i) => s + i.quantity, 0)
          const simpleItem = inCartItems.find(i => !i.modifiers?.length)
          const simpleIdx = simpleItem ? cart.indexOf(simpleItem) : -1
          return (
            <div key={p.id} className={`card overflow-hidden cursor-pointer transition-all hover:border-[var(--color-primary)] hover:shadow-md ${p.stock <= 0 ? 'opacity-40 pointer-events-none' : ''}`}
              onClick={() => addToCart(p)}>
              <div className="relative">
                {p.images?.[0] ? <img src={p.images[0]} alt={p.name} className="w-full h-16 md:h-28 object-cover" /> : <div className="w-full h-16 md:h-28 bg-gray-100 flex items-center justify-center text-xl md:text-2xl">📦</div>}
                {totalQty > 0 && (
                  <span className="absolute top-1 right-1 bg-[var(--color-primary)] text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{totalQty}</span>
                )}
              </div>
              <div className="p-2">
                <p className="font-medium text-[11px] md:text-xs text-[var(--color-text-dark)] line-clamp-2 leading-tight">{p.name}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[var(--color-primary)] font-bold text-xs md:text-sm">${Number(p.price).toFixed(2)}</p>
                  {simpleItem && !p.hasModifiers && (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <button onClick={() => updateQty(simpleIdx, simpleItem.quantity - 1)} className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[10px] md:text-xs flex items-center justify-center hover:bg-gray-100">−</button>
                      <span className="text-[10px] md:text-xs font-bold w-3 md:w-4 text-center">{simpleItem.quantity}</span>
                      <button onClick={() => updateQty(simpleIdx, simpleItem.quantity + 1)} className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[10px] md:text-xs flex items-center justify-center hover:bg-gray-100">+</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )

  // Cart panel
  const cartContent = (
    <div className="flex flex-col h-full min-h-0">
      {comandaTabs}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h2 className="font-semibold text-[var(--color-text-dark)] text-lg">
          {multicomandaEnabled && activeComanda ? activeComanda.name : 'Resumen de venta'}
        </h2>
        {cart.length > 0 && <span className="text-xs text-[var(--color-text)] bg-[var(--color-surface)] px-2 py-1 rounded-full">{itemCount} producto(s)</span>}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-2">
        {cart.length === 0 && (
          <div className="text-center py-8">
            <p className="text-3xl mb-2">🛒</p>
            <p className="text-sm text-[var(--color-text)]">Sin productos en la venta</p>
          </div>
        )}
        {cart.map((item, idx) => {
          const basePrice = item.modifiers?.length ? item.price - item.modifiers.reduce((s, m) => s + m.price, 0) : item.price
          return (
          <div key={`${item.productId}-${idx}`} className="flex items-center justify-between py-3 border-b border-[var(--color-border)] last:border-0">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--color-text-dark)] truncate">{item.name} {item.modifiers?.length ? <span className="text-xs text-[var(--color-text)]">${basePrice.toFixed(2)}</span> : null}</p>
              {item.modifiers?.length ? (
                <div className="space-y-0.5">
                  {item.modifiers.map(m => (
                    <p key={m.id} className="text-[10px] text-[var(--color-primary)]">+ {m.name} ${m.price.toFixed(2)}</p>
                  ))}
                </div>
              ) : null}
              <p className="text-xs text-[var(--color-text)]">${item.price.toFixed(2)} c/u</p>
            </div>
            <div className="flex items-center gap-2 ml-3">
              <button onClick={() => updateQty(idx, item.quantity - 1)} className="w-6 h-6 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-xs flex items-center justify-center hover:bg-gray-100">−</button>
              <span className="text-sm font-bold w-4 text-center">{item.quantity}</span>
              <button onClick={() => updateQty(idx, item.quantity + 1)} className="w-6 h-6 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-xs flex items-center justify-center hover:bg-gray-100">+</button>
            </div>
            <p className="text-sm font-bold ml-3 w-16 text-right">${(item.price * item.quantity).toFixed(2)}</p>
          </div>
          )
        })}
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
        {/* Mobile comanda tabs */}
        {comandaTabs}
        {productsGrid}

        {/* Floating cart bar */}
        {itemCount > 0 && !mobileCartOpen && (
          <button onClick={() => setMobileCartOpen(true)}
            className="fixed bottom-6 left-4 right-4 bg-[var(--color-primary)] text-white py-3.5 px-6 rounded-xl shadow-lg flex items-center justify-between z-30 hover:opacity-90 transition-opacity">
            <div className="flex items-center gap-2">
              <span className="text-lg">🛒</span>
              <span className="font-medium">{multicomandaEnabled && activeComanda ? activeComanda.name : `${itemCount} producto(s)`}</span>
            </div>
            <span className="font-bold text-lg">${total.toFixed(2)}</span>
          </button>
        )}

        {/* Mobile cart overlay */}
        {mobileCartOpen && (
          <div className="fixed inset-0 z-50 bg-white flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)] flex-shrink-0">
              <h2 className="text-lg font-bold text-[var(--color-text-dark)]">
                {multicomandaEnabled && activeComanda ? activeComanda.name : 'Resumen de venta'}
              </h2>
              <button onClick={() => setMobileCartOpen(false)} className="text-2xl text-[var(--color-text)] hover:text-[var(--color-text-dark)]">✕</button>
            </div>
            <div className="flex-1 p-4 min-h-0 overflow-hidden">
              {cartContent}
            </div>
          </div>
        )}
      </div>

      {/* Modifier modal */}
      {modifierModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModifierModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--color-text-dark)] mb-1">{modifierModal.product.name}</h2>
            <p className="text-sm text-[var(--color-text)] mb-4">${Number(modifierModal.product.price).toFixed(2)}</p>

            <button onClick={handleAddWithoutModifiers}
              className="w-full py-3 mb-4 rounded-lg border-2 border-[var(--color-border)] text-sm font-medium text-[var(--color-text-dark)] hover:bg-[var(--color-surface)] transition-colors">
              Agregar sin extras
            </button>

            <div className="space-y-3">
              {modifierModal.groups.map((group: any) => (
                <div key={group.id}>
                  <p className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wide mb-2">{group.name}</p>
                  <div className="space-y-1.5">
                    {group.options.map((opt: any) => (
                      <label key={opt.id} className="flex items-center justify-between py-2 px-3 rounded-lg border border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-surface)] transition-colors">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={selectedModifiers[opt.id] ?? false}
                            onChange={e => setSelectedModifiers(prev => ({ ...prev, [opt.id]: e.target.checked }))}
                            className="w-4 h-4 rounded border-[var(--color-border)]" />
                          <span className="text-sm text-[var(--color-text-dark)]">{opt.name}</span>
                        </div>
                        {Number(opt.price) > 0 && <span className="text-xs font-medium text-[var(--color-primary)]">+${Number(opt.price).toFixed(2)}</span>}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {Object.values(selectedModifiers).some(v => v) && (
              <button onClick={handleAddWithModifiers}
                className="w-full py-3 mt-4 rounded-lg bg-[var(--color-primary)] text-white font-medium text-sm hover:opacity-90 transition-opacity">
                Agregar con extras (+${Object.entries(selectedModifiers).filter(([_, v]) => v).reduce((s, [id]) => {
                  for (const g of modifierModal.groups) {
                    const opt = g.options.find((o: any) => o.id === id)
                    if (opt) return s + Number(opt.price)
                  }
                  return s
                }, 0).toFixed(2)})
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}

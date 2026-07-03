'use client'
import { useState, useEffect } from 'react'

interface Product { id: string; name: string; description: string | null; price: string; images: string[]; stock: number; categoryId: string }
interface Category { id: string; name: string }
interface Info { name: string; giro: string; config: any }
interface CartItem { productId: string; name: string; price: number; quantity: number }

const CART_KEY = 'storehub-public-cart'
function loadCart(): CartItem[] { try { return JSON.parse(localStorage.getItem(CART_KEY) ?? '[]') } catch { return [] } }
function saveCart(cart: CartItem[]) { localStorage.setItem(CART_KEY, JSON.stringify(cart)) }

export function StoreClient({ products, categories, info }: { products: Product[]; categories: Category[]; info: Info }) {
  const [selected, setSelected] = useState<Product | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartLoaded, setCartLoaded] = useState(false)
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const [orderSent, setOrderSent] = useState(false)

  useEffect(() => { setCart(loadCart()); setCartLoaded(true) }, [])
  useEffect(() => { if (cartLoaded) saveCart(cart) }, [cart, cartLoaded])

  const filtered = activeCategory ? products.filter(p => p.categoryId === activeCategory) : products

  const addToCart = (p: Product) => {
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

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0)
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0)

  const handleWhatsAppOrder = () => {
    const whatsapp = info.config?.contact?.whatsapp || info.config?.contact?.phone
    if (!whatsapp) return alert('Esta tienda no tiene WhatsApp configurado')

    // Build message
    const lines = [
      `🛒 *Nuevo pedido — ${info.name}*`,
      '',
      ...cart.map(i => `• ${i.name} x${i.quantity} — $${(i.price * i.quantity).toFixed(2)}`),
      '',
      `*Total: $${total.toFixed(2)}*`,
      '',
      '¡Hola! Me gustaría ordenar lo anterior. 🙏',
    ]
    const message = encodeURIComponent(lines.join('\n'))

    // Clean phone number (remove spaces, dashes, keep + and digits)
    const phone = whatsapp.replace(/[^\d+]/g, '')

    window.open(`https://wa.me/${phone}?text=${message}`, '_blank')
    setOrderSent(true)
    setCart([])
  }

  // Category navigation
  const categoryNav = (
    <nav className="flex gap-2 overflow-x-auto pb-4 mb-6 border-b border-[var(--color-border)]">
      <button onClick={() => setActiveCategory(null)} className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${!activeCategory ? 'bg-[var(--color-primary)] text-white' : 'border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'}`}>
        Todos
      </button>
      {categories.map((c) => (
        <button key={c.id} onClick={() => setActiveCategory(c.id)} className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${activeCategory === c.id ? 'bg-[var(--color-primary)] text-white' : 'border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'}`}>
          {c.name}
        </button>
      ))}
    </nav>
  )

  // Products grid
  const productsGrid = (
    <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {filtered.map((p) => {
        const inCart = cart.find(i => i.productId === p.id)
        return (
          <div key={p.id} className="card overflow-hidden flex flex-col">
            <div className="cursor-pointer" onClick={() => setSelected(p)}>
              {p.images?.[0] ? <img src={p.images[0]} alt={p.name} className="w-full h-32 md:h-40 object-cover" /> : <div className="w-full h-32 md:h-40 bg-gray-50 flex items-center justify-center text-3xl">📦</div>}
              <div className="p-3 flex-1">
                <h3 className="font-medium text-[var(--color-text-dark)] text-sm line-clamp-2">{p.name}</h3>
                <p className="text-[var(--color-primary)] font-bold text-base mt-1">${Number(p.price).toFixed(2)}</p>
              </div>
            </div>
            <div className="px-3 pb-3">
              {p.stock <= 0 ? (
                <span className="text-xs bg-red-50 text-red-500 px-2 py-1 rounded-full">Agotado</span>
              ) : inCart ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateQty(p.id, inCart.quantity - 1)} className="w-7 h-7 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-sm flex items-center justify-center hover:bg-gray-100">−</button>
                    <span className="text-sm font-bold w-5 text-center">{inCart.quantity}</span>
                    <button onClick={() => updateQty(p.id, inCart.quantity + 1)} className="w-7 h-7 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-sm flex items-center justify-center hover:bg-gray-100">+</button>
                  </div>
                  <button onClick={() => removeFromCart(p.id)} className="text-xs text-red-500 hover:text-red-700">Quitar</button>
                </div>
              ) : (
                <button onClick={() => addToCart(p)} className="w-full py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity">
                  Agregar
                </button>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )

  // Cart panel (shared between desktop sidebar and mobile fullscreen)
  const cartPanel = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-[var(--color-text-dark)] text-lg">Tu pedido</h2>
        {cart.length > 0 && <span className="text-xs text-[var(--color-text)]">{itemCount} producto(s)</span>}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-3">
        {cart.length === 0 && !orderSent && (
          <div className="text-center py-8">
            <p className="text-3xl mb-2">🛒</p>
            <p className="text-sm text-[var(--color-text)]">Tu carrito está vacío</p>
            <p className="text-xs text-[var(--color-text)] mt-1">Agrega productos para hacer tu pedido</p>
          </div>
        )}
        {orderSent && cart.length === 0 && (
          <div className="text-center py-8">
            <p className="text-3xl mb-2">✅</p>
            <p className="text-sm font-medium text-green-600">¡Pedido enviado por WhatsApp!</p>
            <p className="text-xs text-[var(--color-text)] mt-1">Te responderemos lo antes posible</p>
            <button onClick={() => setOrderSent(false)} className="text-xs text-[var(--color-primary)] mt-3 hover:underline">Hacer otro pedido</button>
          </div>
        )}
        {cart.map(item => (
          <div key={item.productId} className="flex items-center justify-between py-3 border-b border-[var(--color-border)] last:border-0">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--color-text-dark)] truncate">{item.name}</p>
              <p className="text-xs text-[var(--color-text)]">${item.price.toFixed(2)} c/u</p>
            </div>
            <div className="flex items-center gap-2 ml-3">
              <button onClick={() => updateQty(item.productId, item.quantity - 1)} className="w-6 h-6 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-xs flex items-center justify-center">−</button>
              <span className="text-sm font-medium w-4 text-center">{item.quantity}</span>
              <button onClick={() => updateQty(item.productId, item.quantity + 1)} className="w-6 h-6 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-xs flex items-center justify-center">+</button>
            </div>
            <p className="text-sm font-bold ml-3 w-16 text-right">${(item.price * item.quantity).toFixed(2)}</p>
          </div>
        ))}
      </div>

      {cart.length > 0 && (
        <div className="border-t border-[var(--color-border)] pt-4 mt-4 flex-shrink-0 space-y-3">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-[var(--color-text-dark)]">Total</span>
            <span className="text-xl font-bold text-[var(--color-primary)]">${total.toFixed(2)}</span>
          </div>
          <button onClick={handleWhatsAppOrder}
            className="w-full py-3 rounded-lg bg-green-500 text-white font-medium text-base hover:bg-green-600 transition-colors flex items-center justify-center gap-2">
            <span>📱</span> Ordenar por WhatsApp
          </button>
          <button onClick={() => setCart([])} className="w-full py-2 text-xs text-[var(--color-text)] hover:text-red-500 transition-colors">
            Vaciar carrito
          </button>
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Desktop layout */}
      <div className="hidden lg:flex gap-8">
        <div className="flex-1">
          {categoryNav}
          {productsGrid}
        </div>
        {/* Desktop cart sidebar */}
        <div className="w-80 flex-shrink-0">
          <div className="sticky top-8 card p-5 max-h-[calc(100vh-4rem)] flex flex-col">
            {cartPanel}
          </div>
        </div>
      </div>

      {/* Mobile layout */}
      <div className="lg:hidden">
        {categoryNav}
        {productsGrid}

        {/* Floating cart button */}
        {itemCount > 0 && !mobileCartOpen && (
          <button onClick={() => setMobileCartOpen(true)}
            className="fixed bottom-6 left-4 right-4 bg-green-500 text-white py-3.5 px-6 rounded-xl shadow-lg flex items-center justify-between z-30 hover:bg-green-600 transition-colors">
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
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
              <h2 className="text-lg font-bold text-[var(--color-text-dark)]">Tu pedido</h2>
              <button onClick={() => setMobileCartOpen(false)} className="text-2xl text-[var(--color-text)] hover:text-[var(--color-text-dark)]">✕</button>
            </div>
            <div className="flex-1 p-4 overflow-y-auto min-h-0">
              <div className="flex flex-col h-full">
                {/* Cart items */}
                <div className="flex-1 space-y-3 min-h-0 overflow-y-auto">
                  {cart.map(item => (
                    <div key={item.productId} className="flex items-center justify-between py-3 border-b border-[var(--color-border)] last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text-dark)] truncate">{item.name}</p>
                        <p className="text-xs text-[var(--color-text)]">${item.price.toFixed(2)} c/u</p>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <button onClick={() => updateQty(item.productId, item.quantity - 1)} className="w-7 h-7 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-sm flex items-center justify-center">−</button>
                        <span className="text-sm font-bold w-5 text-center">{item.quantity}</span>
                        <button onClick={() => updateQty(item.productId, item.quantity + 1)} className="w-7 h-7 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-sm flex items-center justify-center">+</button>
                      </div>
                      <p className="text-sm font-bold ml-3 w-16 text-right">${(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Mobile cart footer */}
            {cart.length > 0 && (
              <div className="border-t border-[var(--color-border)] p-4 space-y-3 flex-shrink-0">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-[var(--color-text-dark)]">Total</span>
                  <span className="text-xl font-bold text-[var(--color-primary)]">${total.toFixed(2)}</span>
                </div>
                <button onClick={handleWhatsAppOrder}
                  className="w-full py-3.5 rounded-lg bg-green-500 text-white font-medium text-base hover:bg-green-600 transition-colors flex items-center justify-center gap-2">
                  <span>📱</span> Ordenar por WhatsApp
                </button>
                <button onClick={() => { setCart([]); setMobileCartOpen(false) }} className="w-full py-2 text-xs text-[var(--color-text)] hover:text-red-500 transition-colors">
                  Vaciar carrito
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Product detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
            {selected.images?.[0] ? (
              <img src={selected.images[0]} alt={selected.name} className="w-full h-48 md:h-64 object-cover" />
            ) : (
              <div className="w-full h-48 md:h-64 bg-gray-50 flex items-center justify-center text-6xl">📦</div>
            )}
            <div className="p-6">
              <h2 className="text-xl md:text-2xl font-bold text-[var(--color-text-dark)]">{selected.name}</h2>
              {selected.description && <p className="text-[var(--color-text)] mt-2">{selected.description}</p>}
              <div className="flex items-center justify-between mt-4">
                <span className="text-2xl md:text-3xl font-bold text-[var(--color-primary)]">${Number(selected.price).toFixed(2)}</span>
                {selected.stock > 0
                  ? <span className="text-sm bg-green-50 text-green-600 px-3 py-1 rounded-full">Disponible</span>
                  : <span className="text-sm bg-red-50 text-red-500 px-3 py-1 rounded-full">Agotado</span>
                }
              </div>
            </div>
            <div className="border-t border-[var(--color-border)] p-4 flex gap-2">
              {selected.stock > 0 && (
                <button onClick={() => { addToCart(selected); setSelected(null) }}
                  className="flex-1 py-3 rounded-lg bg-[var(--color-primary)] text-white font-medium hover:opacity-90 transition-opacity">
                  Agregar al carrito
                </button>
              )}
              <button onClick={() => setSelected(null)} className="px-4 py-3 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] hover:bg-gray-50 transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

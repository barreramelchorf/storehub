'use client'
import { useState, useEffect } from 'react'

interface Product { id: string; name: string; description: string | null; price: string; images: string[]; stock: number; categoryId: string }
interface Category { id: string; name: string }
interface Info { name: string; giro: string; config: any }

export function StoreClient({ products, categories, info }: { products: Product[]; categories: Category[]; info: Info }) {
  const [selected, setSelected] = useState<Product | null>(null)

  return (
    <>
      <nav className="flex gap-2 overflow-x-auto pb-4 mb-6 border-b border-[var(--color-border)]">
        <span className="px-4 py-2 rounded-full text-sm font-medium bg-[var(--color-primary)] text-white cursor-pointer">Todos</span>
        {categories.map((c) => (
          <span key={c.id} className="px-4 py-2 rounded-full text-sm font-medium border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors whitespace-nowrap cursor-pointer">
            {c.name}
          </span>
        ))}
      </nav>

      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        {products.map((p) => (
          <div key={p.id} onClick={() => setSelected(p)} className="group card overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
            {p.images?.[0] ? <img src={p.images[0]} alt={p.name} className="w-full h-40 object-cover" /> : <div className="w-full h-40 bg-gray-50 flex items-center justify-center text-4xl">📦</div>}
            <div className="p-4">
              <h3 className="font-medium text-[var(--color-text-dark)] text-sm group-hover:text-[var(--color-primary)] transition-colors">{p.name}</h3>
              <div className="flex items-center justify-between mt-3">
                <span className="text-lg font-bold text-[var(--color-text-dark)]">${Number(p.price).toFixed(2)}</span>
                {p.stock <= 0 && <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full">Agotado</span>}
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Product Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
            {selected.images?.[0] ? (
              <img src={selected.images[0]} alt={selected.name} className="w-full h-64 object-cover" />
            ) : (
              <div className="w-full h-64 bg-gray-50 flex items-center justify-center text-6xl">📦</div>
            )}
            <div className="p-6">
              <h2 className="text-2xl font-bold text-[var(--color-text-dark)]">{selected.name}</h2>
              {selected.description && <p className="text-[var(--color-text)] mt-2">{selected.description}</p>}
              <div className="flex items-center justify-between mt-4">
                <span className="text-3xl font-bold text-[var(--color-primary)]">${Number(selected.price).toFixed(2)}</span>
                {selected.stock > 0
                  ? <span className="text-sm bg-green-50 text-green-600 px-3 py-1 rounded-full">Disponible</span>
                  : <span className="text-sm bg-red-50 text-red-500 px-3 py-1 rounded-full">Agotado</span>
                }
              </div>
            </div>
            <div className="border-t border-[var(--color-border)] p-4">
              <button onClick={() => setSelected(null)} className="btn-secondary w-full">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

export default function AdminDashboard() {
  const token = useAuthStore(s => s.token)
  const { data, isLoading } = useQuery({ queryKey: ['analytics'], queryFn: () => api('/api/admin/analytics', { token: token! }), enabled: !!token })
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => api('/api/admin/products?pageSize=100', { token: token! }), enabled: !!token })

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text-dark)] mb-6">Dashboard</h1>

      {isLoading && <p className="text-[var(--color-text)]">Cargando...</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
            <div className="stat-card">
              <p className="stat-label">Ventas totales</p>
              <p className="stat-value">${Number(data.summary?.totalSales ?? 0).toFixed(2)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Transacciones</p>
              <p className="stat-value">{data.summary?.totalTransactions ?? 0}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Ticket promedio</p>
              <p className="stat-value">${Number(data.summary?.avgTicket ?? 0).toFixed(2)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Productos</p>
              <p className="stat-value">{products?.items?.length ?? 0}</p>
            </div>
          </div>

          {Number(data.summary?.totalTransactions ?? 0) === 0 && (
            <div className="card p-6 text-center mb-6">
              <p className="text-4xl mb-3">🛒</p>
              <p className="text-[var(--color-text-dark)] font-medium">Aún no hay ventas registradas</p>
              <p className="text-sm text-[var(--color-text)] mt-1">Ve al Punto de Venta para registrar tu primera venta.</p>
            </div>
          )}

          {data.topProducts?.length > 0 && (
            <div className="card p-5 mb-6">
              <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-4">Top productos</h2>
              <div className="space-y-3">
                {data.topProducts.map((p: any, i: number) => (
                  <div key={p.productId} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-[var(--color-text)] w-5">{i + 1}</span>
                      <span className="text-sm text-[var(--color-text-dark)]">{p.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium">${Number(p.totalRevenue).toFixed(2)}</span>
                      <span className="text-xs text-[var(--color-text)] ml-2">({p.totalQty} uds)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.lowStock?.length > 0 && (
            <div className="card p-5 border-l-4 border-l-amber-400">
              <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-3">⚠️ Stock bajo</h2>
              <div className="space-y-2">
                {data.lowStock.map((p: any) => (
                  <div key={p.id} className="flex justify-between text-sm">
                    <span className="text-[var(--color-text)]">{p.name}</span>
                    <span className="text-amber-600 font-medium">{p.stock} / {p.minStock}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

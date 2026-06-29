'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

export default function AdminDashboard() {
  const token = useAuthStore(s => s.token)
  const { data, isLoading } = useQuery({ queryKey: ['analytics'], queryFn: () => api('/api/admin/analytics', { token: token! }), enabled: !!token })
  const { data: todayData } = useQuery({
    queryKey: ['analytics-today'],
    queryFn: () => {
      const today = new Date(); today.setHours(0,0,0,0)
      return api(`/api/admin/analytics?from=${today.toISOString()}&to=${new Date().toISOString()}`, { token: token! })
    }, enabled: !!token
  })
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => api('/api/admin/products?pageSize=500', { token: token! }), enabled: !!token })
  const { data: recentSales } = useQuery({ queryKey: ['recent-sales'], queryFn: () => api('/api/admin/sales?pageSize=5', { token: token! }), enabled: !!token })

  const prevChange = data?.previousPeriod?.totalSales > 0
    ? (((Number(data.summary?.totalSales ?? 0) - Number(data.previousPeriod.totalSales)) / Number(data.previousPeriod.totalSales)) * 100).toFixed(0)
    : null

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text-dark)] mb-6">Dashboard</h1>

      {isLoading && <p className="text-[var(--color-text)]">Cargando...</p>}

      {data && (
        <div className="space-y-6">
          {/* Main stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="stat-card">
              <p className="stat-label">Ventas del mes</p>
              <p className="stat-value">${Number(data.summary?.totalSales ?? 0).toFixed(2)}</p>
              {prevChange && <p className={`text-xs mt-1 ${Number(prevChange) >= 0 ? 'text-green-600' : 'text-red-500'}`}>{Number(prevChange) >= 0 ? '↑' : '↓'} {Math.abs(Number(prevChange))}% vs mes anterior</p>}
            </div>
            <div className="stat-card">
              <p className="stat-label">Ventas de hoy</p>
              <p className="stat-value">${Number(todayData?.summary?.totalSales ?? 0).toFixed(2)}</p>
              <p className="text-xs text-[var(--color-text)] mt-1">{todayData?.summary?.totalTransactions ?? 0} transacciones</p>
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

          {/* Mini sales chart */}
          {data.salesByDay?.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-3">Ventas últimos días</h2>
              <div className="flex items-end gap-1 h-20">
                {data.salesByDay.slice(-14).map((d: any) => {
                  const max = Math.max(...data.salesByDay.map((x: any) => Number(x.total)))
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full bg-[var(--color-primary)] rounded-t opacity-70 hover:opacity-100 transition-opacity"
                        style={{ height: `${(Number(d.total) / max) * 100}%`, minHeight: '2px' }}
                        title={`${new Date(d.date).toLocaleDateString()} — $${Number(d.total).toFixed(0)}`} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Recent sales */}
            {recentSales?.items?.length > 0 && (
              <div className="card p-5">
                <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-3">Últimas ventas</h2>
                <div className="space-y-2">
                  {recentSales.items.map((s: any) => (
                    <div key={s.id} className="flex justify-between items-center py-1 border-b border-[var(--color-border)] last:border-0">
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text-dark)]">${Number(s.total).toFixed(2)}</p>
                        <p className="text-xs text-[var(--color-text)]">{new Date(s.createdAt).toLocaleString()}</p>
                      </div>
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{s.paymentMethod}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Low stock alert */}
            {data.lowStock?.length > 0 ? (
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
            ) : (
              <div className="card p-5">
                <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-3">✅ Inventario</h2>
                <p className="text-sm text-[var(--color-text)]">Todos los productos con stock suficiente.</p>
              </div>
            )}
          </div>

          {/* Top products */}
          {data.topProducts?.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-3">Top productos del mes</h2>
              <div className="space-y-2">
                {data.topProducts.slice(0, 5).map((p: any, i: number) => (
                  <div key={p.productId} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-[var(--color-text)] w-5">{i + 1}</span>
                      <span className="text-sm text-[var(--color-text-dark)]">{p.name}</span>
                    </div>
                    <span className="text-sm font-medium">{p.totalQty} uds</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { getAuthStore } from '@/lib/store'
import { useParams } from 'next/navigation'

export default function AdminDashboard() {
  const params = useParams(); const token = getAuthStore(params.slug as string)(s => s.token)
  const { data, isLoading } = useQuery({ queryKey: ['analytics'], queryFn: () => {
    const from = new Date(); from.setDate(from.getDate() - 30); from.setHours(0,0,0,0)
    const to = new Date(); to.setHours(23,59,59,999)
    return api(`/api/admin/analytics?from=${from.toISOString()}&to=${to.toISOString()}`, { token: token! })
  }, enabled: !!token })
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
          {(() => {
            const tz = 'America/Mexico_City'
            const days = Array.from({ length: 14 }, (_, i) => {
              const d = new Date(); d.setDate(d.getDate() - i)
              return d.toLocaleDateString('en-CA', { timeZone: tz })
            })
            const salesMap = Object.fromEntries((data.salesByDay ?? []).map((x: any) => [x.date, Number(x.total)]))
            const chartData = days.map(date => ({ date, total: salesMap[date] ?? 0 }))
            const max = Math.max(...chartData.map(x => x.total), 1)
            const barMaxHeight = 80 // px
            return (
              <div className="card p-5">
                <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-3">Ventas últimos 14 días</h2>
                <div className="flex items-end gap-1" style={{ height: `${barMaxHeight + 20}px` }}>
                  {chartData.map((d) => {
                    const barHeight = d.total > 0 ? Math.max((d.total / max) * barMaxHeight, 4) : 2
                    return (
                      <div key={d.date} className="flex-1 flex flex-col items-center justify-end" style={{ height: '100%' }}>
                        <div
                          className={`w-full rounded-t ${d.total > 0 ? 'bg-[var(--color-primary)]' : 'bg-gray-200'}`}
                          style={{ height: `${barHeight}px` }}
                          title={`${d.date} — $${d.total.toFixed(0)}`} />
                        <span className="text-[8px] text-[var(--color-text)] mt-1">{d.date.split('-')[2]}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

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

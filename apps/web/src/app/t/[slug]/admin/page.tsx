'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { getAuthStore } from '@/lib/store'
import { useParams } from 'next/navigation'

export default function AdminDashboard() {
  const params = useParams(); const token = getAuthStore(params.slug as string)(s => s.token)
  const [selectedSale, setSelectedSale] = useState<any>(null)
  const { data, isLoading } = useQuery({ queryKey: ['analytics'], queryFn: () => {
    const now = new Date()
    const from = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
    const to = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999))
    return api(`/api/admin/analytics?from=${from.toISOString()}&to=${to.toISOString()}`, { token: token! })
  }, enabled: !!token })
  const { data: todayData } = useQuery({
    queryKey: ['analytics-today'],
    queryFn: () => {
      const now = new Date()
      const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
      const end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999))
      return api(`/api/admin/analytics?from=${today.toISOString()}&to=${end.toISOString()}`, { token: token! })
    }, enabled: !!token
  })
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => api('/api/admin/products?pageSize=500', { token: token! }), enabled: !!token })
  const { data: recentSales } = useQuery({ queryKey: ['recent-sales'], queryFn: () => api('/api/admin/sales?pageSize=5', { token: token! }), enabled: !!token })
  const { data: saleDetail } = useQuery({ queryKey: ['sale-detail', selectedSale?.id], queryFn: () => api(`/api/admin/sales/${selectedSale.id}`, { token: token! }), enabled: !!selectedSale })

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
              <DashboardChart chartData={chartData} max={max} barMaxHeight={barMaxHeight} />
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
                        <p className="text-xs text-[var(--color-text)]">{s.user?.username || s.user?.email || '—'} · {new Date(s.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setSelectedSale(s)} className="text-xs text-[var(--color-primary)] hover:underline">Ver</button>
                        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{s.paymentMethod}</span>
                      </div>
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

          {/* Top products + Top modifiers side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
          {data.topModifiers?.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-3">Top modificadores del mes</h2>
              <div className="space-y-2">
                {data.topModifiers.slice(0, 5).map((m: any, i: number) => (
                  <div key={m.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-[var(--color-text)] w-5">{i + 1}</span>
                      <span className="text-sm text-[var(--color-text-dark)]">{m.name}</span>
                    </div>
                    <span className="text-sm font-medium">{m.times_sold}x</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      {/* Sale detail modal */}
      {selectedSale && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelectedSale(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--color-text-dark)]">Detalle de venta</h2>
                <p className="text-xs text-[var(--color-text)]">{new Date(selectedSale.saleDate).toLocaleDateString('es-MX', { timeZone: 'UTC' })} · {new Date(selectedSale.createdAt).toLocaleTimeString('es-MX')}</p>
              </div>
              <button onClick={() => setSelectedSale(null)} className="text-xl text-[var(--color-text)]">✕</button>
            </div>
            {saleDetail?.items && (
              <div className="space-y-2 mb-4">
                {saleDetail.items.map((item: any) => (
                  <div key={item.id} className="flex justify-between text-sm py-2 border-b border-[var(--color-border)] last:border-0">
                    <div>
                      <p className="text-[var(--color-text-dark)] font-medium">{item.product?.name ?? 'Producto'}</p>
                      {item.modifiers?.length > 0 && (
                        <div className="space-y-0.5">
                          {item.modifiers.map((m: any, i: number) => (
                            <p key={i} className="text-[10px] text-[var(--color-primary)]">+ {m.name} ${Number(m.price).toFixed(2)}</p>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-[var(--color-text)]">x{item.quantity} · ${Number(item.unitPrice).toFixed(2)} c/u</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">${Number(item.subtotal).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1 pt-3 border-t border-[var(--color-border)]">
              {saleDetail?.user && <div className="flex justify-between text-sm mb-2"><span className="text-[var(--color-text)]">Cajero</span><span className="font-medium">{saleDetail.user.username || saleDetail.user.email}</span></div>}
              {Number(selectedSale.discount) > 0 && <div className="flex justify-between text-sm"><span className="text-[var(--color-text)]">Descuento</span><span className="text-green-600">-${Number(selectedSale.discount).toFixed(2)}</span></div>}
              {Number(selectedSale.tip) > 0 && <div className="flex justify-between text-sm"><span className="text-[var(--color-text)]">Propina</span><span>+${Number(selectedSale.tip).toFixed(2)}</span></div>}
              <div className="flex justify-between font-bold text-lg pt-2"><span>Total</span><span>${Number(selectedSale.total).toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DashboardChart({ chartData, max, barMaxHeight }: { chartData: Array<{ date: string; total: number }>; max: number; barMaxHeight: number }) {
  const [selected, setSelected] = useState<string | null>(null)
  const selectedData = chartData.find(d => d.date === selected)

  return (
    <div className="card p-5">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-semibold text-[var(--color-text-dark)]">Ventas últimos 14 días</h2>
        {selectedData && (
          <div className="text-right animate-in fade-in duration-150">
            <span className="text-xs text-[var(--color-text)]">{selectedData.date}</span>
            <span className="text-sm font-bold text-[var(--color-primary)] ml-2">${selectedData.total.toLocaleString('es-MX')}</span>
          </div>
        )}
      </div>
      <div className="flex items-end gap-1" style={{ height: `${barMaxHeight + 20}px` }}>
        {chartData.map((d) => {
          const barHeight = d.total > 0 ? Math.max((d.total / max) * barMaxHeight, 4) : 2
          const isSelected = selected === d.date
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end cursor-pointer" style={{ height: '100%' }}
              onClick={() => setSelected(isSelected ? null : d.date)}>
              {isSelected && d.total > 0 && (
                <span className="text-[9px] font-medium text-[var(--color-primary)] mb-1">${d.total >= 1000 ? `${(d.total/1000).toFixed(1)}k` : d.total.toFixed(0)}</span>
              )}
              <div
                className={`w-full rounded-t transition-all ${d.total > 0 ? (isSelected ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-primary)] opacity-60') : 'bg-gray-200'}`}
                style={{ height: `${barHeight}px` }}
                title={`${d.date} — $${d.total.toFixed(0)}`} />
              <span className={`text-[8px] mt-1 ${isSelected ? 'font-bold text-[var(--color-primary)]' : 'text-[var(--color-text)]'}`}>{d.date.split('-')[2]}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

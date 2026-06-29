'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { getAuthStore } from "@/lib/store"
import { useParams } from "next/navigation"

export default function AnalyticsPage() {
  const params = useParams(); const token = getAuthStore(params.slug as string)(s => s.token)!
  const [period, setPeriod] = useState('month')

  const getRange = () => {
    const now = new Date()
    let from: Date
    if (period === 'day') { from = new Date(now.getFullYear(), now.getMonth(), now.getDate()) }
    else if (period === 'week') { from = new Date(now); from.setDate(now.getDate() - now.getDay()); from.setHours(0,0,0,0) }
    else { from = new Date(now.getFullYear(), now.getMonth(), 1) }
    return { from: from.toISOString(), to: now.toISOString() }
  }

  const range = getRange()
  const { data } = useQuery({ queryKey: ['analytics', period], queryFn: () => api(`/api/admin/analytics?from=${range.from}&to=${range.to}`, { token }) })

  const prevChange = data?.previousPeriod?.totalSales > 0
    ? (((Number(data.summary?.totalSales ?? 0) - Number(data.previousPeriod.totalSales)) / Number(data.previousPeriod.totalSales)) * 100).toFixed(1)
    : null

  const maxDaySale = Math.max(...(data?.salesByDay?.map((d: any) => Number(d.total)) ?? [1]))

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">Analytics</h1>
        <div className="flex gap-2">
          {[{k:'day',l:'Hoy'},{k:'week',l:'Semana'},{k:'month',l:'Mes'}].map(p => (
            <button key={p.k} onClick={() => setPeriod(p.k)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${period === p.k ? 'bg-[var(--color-primary)] text-white' : 'bg-white border border-[var(--color-border)] text-[var(--color-text)]'}`}>{p.l}</button>
          ))}
        </div>
      </div>

      {data && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="stat-card">
              <p className="stat-label">Ventas</p>
              <p className="stat-value">${Number(data.summary?.totalSales ?? 0).toFixed(2)}</p>
              {prevChange && <p className={`text-xs mt-1 ${Number(prevChange) >= 0 ? 'text-green-600' : 'text-red-500'}`}>{Number(prevChange) >= 0 ? '↑' : '↓'} {Math.abs(Number(prevChange))}% vs período anterior</p>}
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
              <p className="stat-label">Propinas</p>
              <p className="stat-value">${Number(data.summary?.totalTips ?? 0).toFixed(2)}</p>
            </div>
          </div>

          {/* Sales by day chart */}
          {data.salesByDay?.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-4">Ventas por día</h2>
              <div className="flex items-end gap-1 h-32">
                {data.salesByDay.map((d: any) => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-[var(--color-primary)] rounded-t opacity-80 hover:opacity-100 transition-opacity"
                      style={{ height: `${(Number(d.total) / maxDaySale) * 100}%`, minHeight: '4px' }}
                      title={`$${Number(d.total).toFixed(0)} - ${d.count} ventas`} />
                    <span className="text-[9px] text-[var(--color-text)]">{new Date(d.date).getDate()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Payment methods */}
            {data.salesByPayment?.length > 0 && (
              <div className="card p-5">
                <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-4">Por método de pago</h2>
                <div className="space-y-3">
                  {data.salesByPayment.map((p: any) => {
                    const pct = (Number(p.total) / Number(data.summary.totalSales) * 100).toFixed(0)
                    const labels: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', other: 'Otro' }
                    return (
                      <div key={p.method}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-[var(--color-text)]">{labels[p.method] ?? p.method}</span>
                          <span className="font-medium">${Number(p.total).toFixed(0)} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-[var(--color-primary)] rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Hours heatmap */}
            {data.salesByHour?.length > 0 && (
              <div className="card p-5">
                <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-4">Horas pico</h2>
                <div className="grid grid-cols-6 gap-1">
                  {Array.from({ length: 24 }, (_, h) => {
                    const hourData = data.salesByHour.find((x: any) => Number(x.hour) === h)
                    const maxHour = Math.max(...data.salesByHour.map((x: any) => Number(x.count)))
                    const intensity = hourData ? Number(hourData.count) / maxHour : 0
                    return (
                      <div key={h} className="flex flex-col items-center">
                        <div className="w-full aspect-square rounded" style={{ backgroundColor: `rgba(99, 91, 255, ${intensity * 0.8 + 0.05})` }}
                          title={`${h}:00 - ${hourData?.count ?? 0} ventas`} />
                        <span className="text-[8px] text-[var(--color-text)] mt-0.5">{h}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Top products */}
          {data.topProducts?.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-4">Top productos</h2>
              <div className="space-y-2">
                {data.topProducts.map((p: any, i: number) => (
                  <div key={p.productId} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-[var(--color-text)] w-5">{i + 1}</span>
                      <span className="text-sm text-[var(--color-text-dark)]">{p.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium">${Number(p.totalRevenue).toFixed(0)}</span>
                      <span className="text-xs text-[var(--color-text)] ml-2">{p.totalQty} uds</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Low stock */}
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
        </div>
      )}
    </div>
  )
}

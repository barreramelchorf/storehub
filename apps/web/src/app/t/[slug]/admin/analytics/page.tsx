'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { getAuthStore } from '@/lib/store'
import { useParams } from 'next/navigation'

const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export default function AnalyticsPage() {
  const params = useParams(); const token = getAuthStore(params.slug as string)(s => s.token)!
  const [period, setPeriod] = useState('month')

  const getRange = () => {
    const now = new Date()
    let from: Date
    if (period === 'day') { from = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) }
    else if (period === 'week') { const d = new Date(now); d.setDate(now.getDate() - now.getDay()); from = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) }
    else { from = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)) }
    const to = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999))
    return { from: from.toISOString(), to: to.toISOString() }
  }

  const range = getRange()
  const { data } = useQuery({ queryKey: ['analytics', period], queryFn: () => api(`/api/admin/analytics?from=${range.from}&to=${range.to}`, { token }), enabled: period !== 'year' })

  // Fill all days in the range (so days without sales show as empty bars)
  const filledSalesByDay = (() => {
    if (!data?.salesByDay || period === 'day') return data?.salesByDay ?? []
    const from = new Date(range.from)
    const to = new Date(range.to)
    const salesMap: Record<string, any> = {}
    for (const d of data.salesByDay) salesMap[d.date] = d
    const days: any[] = []
    const current = new Date(from)
    while (current <= to) {
      const dateStr = current.toISOString().slice(0, 10)
      days.push(salesMap[dateStr] ?? { date: dateStr, total: 0, count: 0 })
      current.setDate(current.getDate() + 1)
    }
    return days
  })()

  const maxDaySale = Math.max(...(filledSalesByDay.map((d: any) => Number(d.total)) ?? [1]), 1)

  // Yearly data
  const { data: yearData } = useQuery({
    queryKey: ['analytics-yearly'],
    queryFn: () => api(`/api/admin/analytics/yearly`, { token }),
    enabled: period === 'year',
  })

  const prevChange = data?.previousPeriod?.totalSales > 0
    ? (((Number(data.summary?.totalSales ?? 0) - Number(data.previousPeriod.totalSales)) / Number(data.previousPeriod.totalSales)) * 100).toFixed(1)
    : null

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">Analytics</h1>
        <div className="flex gap-2">
          {[{k:'day',l:'Hoy'},{k:'week',l:'Semana'},{k:'month',l:'Mes'},{k:'year',l:'Año'}].map(p => (
            <button key={p.k} onClick={() => setPeriod(p.k)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${period === p.k ? 'bg-[var(--color-primary)] text-white' : 'bg-white border border-[var(--color-border)] text-[var(--color-text)]'}`}>{p.l}</button>
          ))}
        </div>
      </div>

      {/* Yearly view */}
      {period === 'year' && yearData && <YearlyView data={yearData} />}

      {/* Regular views (day/week/month) */}
      {period !== 'year' && data && (
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
            <SalesByDayChart salesByDay={filledSalesByDay} maxDaySale={maxDaySale} />
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
                    const maxHour = Math.max(...data.salesByHour.map((x: any) => Number(x.count)), 1)
                    const intensity = hourData ? Number(hourData.count) / maxHour : 0
                    return (
                      <div key={h} className="flex flex-col items-center">
                        <div className={`w-full aspect-square rounded ${intensity === 0 ? 'bg-gray-100' : ''}`}
                          style={intensity > 0 ? { backgroundColor: `var(--color-primary)`, opacity: intensity * 0.85 + 0.15 } : undefined}
                          title={`${h}:00 - ${hourData?.count ?? 0} ventas · $${Number(hourData?.total ?? 0).toFixed(0)}`} />
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

function YearlyView({ data }: { data: any }) {
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const maxMonthTotal = Math.max(...(data.monthlyData?.map((m: any) => m.total) ?? [1]), 1)
  const labels: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', other: 'Otro' }

  return (
    <div className="space-y-6">
      {/* Year summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="stat-card">
          <p className="stat-label">Ventas del año {data.year}</p>
          <p className="stat-value">${Number(data.summary?.totalSales ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Transacciones</p>
          <p className="stat-value">{data.summary?.totalTransactions ?? 0}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Ticket promedio</p>
          <p className="stat-value">${Number(data.summary?.avgTicket ?? 0).toFixed(2)}</p>
        </div>
      </div>

      {/* Month-by-month bar chart */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-4">Ventas por mes</h2>
        <div className="flex items-end gap-2 h-40">
          {data.monthlyData?.map((m: any) => {
            const barHeight = m.total > 0 ? Math.max((m.total / maxMonthTotal) * 100, 4) : 2
            const isSelected = selectedMonth === m.month
            return (
              <div key={m.month} className="flex-1 flex flex-col items-center justify-end cursor-pointer" style={{ height: '100%' }}
                onClick={() => setSelectedMonth(isSelected ? null : m.month)}>
                <div
                  className={`w-full rounded-t transition-all ${m.total > 0 ? (isSelected ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-primary)] opacity-70 hover:opacity-100') : 'bg-gray-200'}`}
                  style={{ height: `${barHeight}%` }}
                  title={`${MONTH_NAMES[m.month - 1]} — $${Number(m.total).toLocaleString('es-MX')} (${m.count} ventas)`} />
                <span className={`text-xs mt-2 ${isSelected ? 'font-bold text-[var(--color-primary)]' : 'text-[var(--color-text)]'}`}>
                  {MONTH_NAMES[m.month - 1]}
                </span>
                {m.total > 0 && (
                  <span className="text-[9px] text-[var(--color-text)]">${(m.total / 1000).toFixed(1)}k</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected month detail */}
      {selectedMonth && (() => {
        const monthData = data.monthlyData?.find((m: any) => m.month === selectedMonth)
        const monthProducts = data.topProductsByMonth?.[selectedMonth] ?? []
        return (
          <div className="card p-5 border-l-4 border-l-[var(--color-primary)]">
            <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-4">
              {MONTH_NAMES[selectedMonth - 1]} {data.year} — Detalle
            </h2>
            {monthData && monthData.total > 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <p className="text-xs text-[var(--color-text)]">Ventas</p>
                    <p className="font-semibold">${Number(monthData.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--color-text)]">Transacciones</p>
                    <p className="font-semibold">{monthData.count}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--color-text)]">Ticket promedio</p>
                    <p className="font-semibold">${Number(monthData.avgTicket).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--color-text)]">Propinas</p>
                    <p className="font-semibold">${Number(monthData.tips).toFixed(2)}</p>
                  </div>
                </div>
                {monthProducts.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-[var(--color-text)] mb-2">Top productos del mes</p>
                    <div className="space-y-1">
                      {monthProducts.map((p: any, i: number) => (
                        <div key={p.productId} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[var(--color-text)] w-4">{i + 1}</span>
                            <span>{p.name}</span>
                          </div>
                          <span className="text-xs text-[var(--color-text)]">{p.totalQty} uds · ${Number(p.totalRevenue).toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text)]">Sin datos para este mes.</p>
            )}
          </div>
        )
      })()}

      {/* Year-wide top products */}
      {data.topProductsYear?.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-4">Top productos del año</h2>
          <div className="space-y-2">
            {data.topProductsYear.map((p: any, i: number) => (
              <div key={p.productId} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-[var(--color-text)] w-5">{i + 1}</span>
                  <span className="text-sm text-[var(--color-text-dark)]">{p.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium">${Number(p.totalRevenue).toLocaleString('es-MX')}</span>
                  <span className="text-xs text-[var(--color-text)] ml-2">{p.totalQty} uds</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment methods for the year */}
      {data.paymentMethods?.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-4">Métodos de pago del año</h2>
          <div className="space-y-3">
            {data.paymentMethods.map((p: any) => {
              const pct = data.summary.totalSales > 0 ? (Number(p.total) / data.summary.totalSales * 100).toFixed(0) : '0'
              return (
                <div key={p.method}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-[var(--color-text)]">{labels[p.method] ?? p.method}</span>
                    <span className="font-medium">${Number(p.total).toLocaleString('es-MX')} ({pct}%)</span>
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

      {/* Empty state if no data at all */}
      {data.summary?.totalTransactions === 0 && (
        <div className="card p-8 text-center">
          <p className="text-[var(--color-text)]">No hay ventas registradas en {data.year}.</p>
        </div>
      )}
    </div>
  )
}

function SalesByDayChart({ salesByDay, maxDaySale }: { salesByDay: any[]; maxDaySale: number }) {
  const [selected, setSelected] = useState<string | null>(null)
  const selectedData = salesByDay.find((d: any) => d.date === selected)

  return (
    <div className="card p-5">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-dark)]">Ventas por día</h2>
        {selectedData && (
          <div className="text-right animate-in fade-in duration-150">
            <span className="text-xs text-[var(--color-text)]">{selectedData.date}</span>
            <span className="text-sm font-bold text-[var(--color-primary)] ml-2">${Number(selectedData.total).toLocaleString('es-MX')} · {selectedData.count} ventas</span>
          </div>
        )}
      </div>
      <div className="flex items-end gap-1 h-32">
        {salesByDay.map((d: any) => {
          const isSelected = selected === d.date
          const barHeight = Number(d.total) > 0 ? Math.max((Number(d.total) / maxDaySale) * 100, 4) : 2
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end cursor-pointer" style={{ height: '100%' }}
              onClick={() => setSelected(isSelected ? null : d.date)}>
              {isSelected && (
                <span className="text-[9px] font-medium text-[var(--color-primary)]">${Number(d.total) >= 1000 ? `${(Number(d.total)/1000).toFixed(1)}k` : Number(d.total).toFixed(0)}</span>
              )}
              <div className={`w-full rounded-t transition-all ${isSelected ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-primary)] opacity-60'}`}
                style={{ height: `${barHeight}%`, minHeight: '4px' }}
                title={`$${Number(d.total).toFixed(0)} - ${d.count} ventas`} />
              <span className={`text-[9px] ${isSelected ? 'font-bold text-[var(--color-primary)]' : 'text-[var(--color-text)]'}`}>{d.date.split('-')[2]}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

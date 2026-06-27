'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

export default function AnalyticsPage() {
  const token = useAuthStore(s => s.token)!
  const [period, setPeriod] = useState('month')

  const getRange = () => {
    const now = new Date()
    const from = new Date()
    if (period === 'day') from.setDate(now.getDate() - 1)
    else if (period === 'week') from.setDate(now.getDate() - 7)
    else from.setMonth(now.getMonth() - 1)
    return { from: from.toISOString(), to: now.toISOString() }
  }

  const range = getRange()
  const { data } = useQuery({ queryKey: ['analytics', period], queryFn: () => api(`/api/admin/analytics?from=${range.from}&to=${range.to}`, { token }) })

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="flex gap-2">
          {['day', 'week', 'month'].map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1 rounded text-sm ${period === p ? 'bg-primary text-white' : 'bg-gray-200'}`}>
              {p === 'day' ? 'Hoy' : p === 'week' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg shadow"><p className="text-xs text-gray-500">Ventas</p><p className="text-xl font-bold">${Number(data.summary?.totalSales ?? 0).toFixed(2)}</p></div>
            <div className="bg-white p-4 rounded-lg shadow"><p className="text-xs text-gray-500">Transacciones</p><p className="text-xl font-bold">{data.summary?.totalTransactions ?? 0}</p></div>
            <div className="bg-white p-4 rounded-lg shadow"><p className="text-xs text-gray-500">Ticket promedio</p><p className="text-xl font-bold">${Number(data.summary?.avgTicket ?? 0).toFixed(2)}</p></div>
            <div className="bg-white p-4 rounded-lg shadow"><p className="text-xs text-gray-500">Propinas</p><p className="text-xl font-bold">${Number(data.summary?.totalTips ?? 0).toFixed(2)}</p></div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="font-medium mb-3">Top productos</h2>
            <table className="w-full text-sm">
              <thead><tr><th className="text-left p-2">Producto</th><th className="p-2">Cantidad</th><th className="p-2">Ingresos</th></tr></thead>
              <tbody>
                {data.topProducts?.map((p: any) => (
                  <tr key={p.productId} className="border-t"><td className="p-2">{p.name}</td><td className="p-2 text-center">{p.totalQty}</td><td className="p-2 text-center">${Number(p.totalRevenue).toFixed(2)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

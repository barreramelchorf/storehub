'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

export default function AdminDashboard() {
  const token = useAuthStore(s => s.token)
  const { data } = useQuery({ queryKey: ['analytics'], queryFn: () => api('/api/admin/analytics', { token: token! }) })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg shadow"><p className="text-sm text-gray-500">Ventas totales</p><p className="text-2xl font-bold">${Number(data.summary?.totalSales ?? 0).toFixed(2)}</p></div>
          <div className="bg-white p-4 rounded-lg shadow"><p className="text-sm text-gray-500">Transacciones</p><p className="text-2xl font-bold">{data.summary?.totalTransactions ?? 0}</p></div>
          <div className="bg-white p-4 rounded-lg shadow"><p className="text-sm text-gray-500">Ticket promedio</p><p className="text-2xl font-bold">${Number(data.summary?.avgTicket ?? 0).toFixed(2)}</p></div>
        </div>
      )}
      {data?.lowStock?.length > 0 && (
        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h2 className="font-medium text-yellow-800 mb-2">⚠️ Stock bajo</h2>
          <ul className="text-sm space-y-1">{data.lowStock.map((p: any) => <li key={p.id}>{p.name}: {p.stock}/{p.minStock}</li>)}</ul>
        </div>
      )}
    </div>
  )
}

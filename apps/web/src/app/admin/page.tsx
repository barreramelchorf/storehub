'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

export default function AdminDashboard() {
  const token = useAuthStore(s => s.token)
  const { data } = useQuery({ queryKey: ['analytics'], queryFn: () => api('/api/admin/analytics', { token: token! }) })

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text-dark)] mb-6">Dashboard</h1>
      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
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
          </div>

          {data.lowStock?.length > 0 && (
            <div className="card p-5 border-l-4 border-l-amber-400">
              <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-3">⚠️ Productos con stock bajo</h2>
              <div className="space-y-2">
                {data.lowStock.map((p: any) => (
                  <div key={p.id} className="flex justify-between text-sm">
                    <span>{p.name}</span>
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

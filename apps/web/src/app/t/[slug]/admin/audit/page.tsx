'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { getAuthStore } from "@/lib/store"
import { useParams } from "next/navigation"

export default function AuditPage() {
  const params = useParams(); const token = getAuthStore(params.slug as string)(s => s.token)!
  const [filter, setFilter] = useState('')

  const { data } = useQuery({ queryKey: ['audit', filter], queryFn: () => api(`/api/admin/audit${filter ? `?eventType=${filter}` : ''}`, { token }) })

  const eventTypes = ['price_override', 'sale_backdated', 'product_created', 'product_updated', 'product_deleted', 'settings_updated', 'user_created', 'role_updated']

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">Auditoría</h1>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="input w-auto">
          <option value="">Todos los eventos</option>
          {eventTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]"><th className="p-3 text-left table-header">Fecha</th><th className="p-3 table-header">Evento</th><th className="p-3 table-header">Entidad</th><th className="p-3 text-left table-header">Detalle</th></tr></thead>
          <tbody>
            {data?.map((log: any) => (
              <tr key={log.id} className="border-b border-[var(--color-border)]">
                <td className="p-3 text-xs text-[var(--color-text)]">{new Date(log.createdAt).toLocaleString()}</td>
                <td className="p-3 text-center"><span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{log.eventType}</span></td>
                <td className="p-3 text-center text-xs">{log.entityType}</td>
                <td className="p-3 text-xs text-[var(--color-text)] max-w-xs truncate">{JSON.stringify(log.payload)}</td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-[var(--color-text)]">Sin eventos registrados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

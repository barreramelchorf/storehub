'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { getAuthStore } from "@/lib/store"
import { useParams } from "next/navigation"

export default function ApprovalsPage() {
  const params = useParams(); const token = getAuthStore(params.slug as string)(s => s.token)!
  const queryClient = useQueryClient()

  const { data } = useQuery({ queryKey: ['pending-sales'], queryFn: () => api('/api/admin/sales?status=pending_approval', { token }) })

  const approveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api(`/api/admin/sales/${id}/approve`, { method: 'POST', body: JSON.stringify({ status }), token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pending-sales'] }),
  })

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text-dark)] mb-6">Aprobación de ventas</h1>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]"><th className="p-3 text-left table-header">Fecha de venta</th><th className="p-3 table-header">Total</th><th className="p-3 table-header">Registrado</th><th className="p-3 table-header">Acciones</th></tr></thead>
          <tbody>
            {data?.items?.map((s: any) => (
              <tr key={s.id} className="border-b border-[var(--color-border)]">
                <td className="p-3">{new Date(s.saleDate).toLocaleDateString()}</td>
                <td className="p-3 text-center font-medium">${Number(s.total).toFixed(2)}</td>
                <td className="p-3 text-center text-xs text-[var(--color-text)]">{new Date(s.createdAt).toLocaleString()}</td>
                <td className="p-3 text-center space-x-2">
                  <button onClick={() => approveMutation.mutate({ id: s.id, status: 'approved' })} className="btn-primary text-xs px-2 py-1">Aprobar</button>
                  <button onClick={() => approveMutation.mutate({ id: s.id, status: 'rejected' })} className="btn-danger">Rechazar</button>
                </td>
              </tr>
            ))}
            {(!data?.items || data.items.length === 0) && <tr><td colSpan={4} className="p-6 text-center text-[var(--color-text)]">No hay ventas pendientes</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

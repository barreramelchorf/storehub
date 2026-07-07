'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { getAuthStore } from '@/lib/store'
import { useParams } from 'next/navigation'

export default function ApprovalsPage() {
  const params = useParams(); const token = getAuthStore(params.slug as string)(s => s.token)!
  const queryClient = useQueryClient()

  const { data: pendingApproval } = useQuery({ queryKey: ['pending-approval'], queryFn: () => api('/api/admin/sales?status=pending_approval', { token }) })
  const { data: pendingDelete } = useQuery({ queryKey: ['pending-delete'], queryFn: () => api('/api/admin/sales?status=pending_delete', { token }) })

  const approveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api(`/api/admin/sales/${id}/approve`, { method: 'POST', body: JSON.stringify({ status }), token }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pending-approval'] }); queryClient.invalidateQueries({ queryKey: ['pending-delete'] }) },
  })

  const allPending = [
    ...(pendingApproval?.items?.map((s: any) => ({ ...s, _type: 'backdate' })) ?? []),
    ...(pendingDelete?.items?.map((s: any) => ({ ...s, _type: 'delete' })) ?? []),
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text-dark)] mb-6">Aprobaciones</h1>

      {allPending.length === 0 && (
        <div className="card p-8 text-center text-[var(--color-text)]">
          <p className="text-3xl mb-2">✅</p>
          <p>No hay solicitudes pendientes</p>
        </div>
      )}

      {/* Desktop table */}
      {allPending.length > 0 && (
        <>
          <div className="hidden md:block card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                  <th className="p-3 text-left table-header">Tipo</th>
                  <th className="p-3 text-left table-header">Fecha de venta</th>
                  <th className="p-3 table-header">Total</th>
                  <th className="p-3 table-header">Registrado</th>
                  <th className="p-3 table-header">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {allPending.map((s: any) => (
                  <tr key={s.id} className="border-b border-[var(--color-border)]">
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s._type === 'delete' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                        {s._type === 'delete' ? '🗑️ Eliminación' : '📅 Venta backdated'}
                      </span>
                    </td>
                    <td className="p-3">{new Date(s.saleDate).toLocaleDateString('es-MX')}</td>
                    <td className="p-3 text-center font-medium">${Number(s.total).toFixed(2)}</td>
                    <td className="p-3 text-center text-xs text-[var(--color-text)]">{new Date(s.createdAt).toLocaleString('es-MX')}</td>
                    <td className="p-3 text-center space-x-2">
                      <button onClick={() => approveMutation.mutate({ id: s.id, status: 'approved' })} disabled={approveMutation.isPending} className="btn-primary text-xs px-2 py-1">Aprobar</button>
                      <button onClick={() => approveMutation.mutate({ id: s.id, status: 'rejected' })} disabled={approveMutation.isPending} className="btn-danger">Rechazar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {allPending.map((s: any) => (
              <div key={s.id} className="card p-4">
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${s._type === 'delete' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                    {s._type === 'delete' ? '🗑️ Eliminación' : '📅 Backdated'}
                  </span>
                  <p className="font-bold text-[var(--color-text-dark)]">${Number(s.total).toFixed(2)}</p>
                </div>
                <p className="text-xs text-[var(--color-text)] mb-3">
                  Venta del {new Date(s.saleDate).toLocaleDateString('es-MX')} · Registrada {new Date(s.createdAt).toLocaleString('es-MX')}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => approveMutation.mutate({ id: s.id, status: 'approved' })} disabled={approveMutation.isPending}
                    className="flex-1 py-2 rounded-lg bg-[var(--color-primary)] text-white text-xs font-medium">Aprobar</button>
                  <button onClick={() => approveMutation.mutate({ id: s.id, status: 'rejected' })} disabled={approveMutation.isPending}
                    className="flex-1 py-2 rounded-lg bg-red-50 text-red-600 text-xs font-medium">Rechazar</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

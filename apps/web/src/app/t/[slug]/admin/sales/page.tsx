'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { getAuthStore } from '@/lib/store'
import { useParams } from 'next/navigation'

export default function SalesPage() {
  const params = useParams(); const token = getAuthStore(params.slug as string)(s => s.token)!
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedSale, setSelectedSale] = useState<any>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  // Get user permissions from token
  const permissions: string[] = (() => {
    try {
      const payload = token.split('.')[1]
      const padded = payload + '='.repeat((4 - payload.length % 4) % 4)
      return JSON.parse(atob(padded)).permissions ?? []
    } catch { return [] }
  })()
  const isAdminOrManager = permissions.includes('users.manage')

  const { data } = useQuery({
    queryKey: ['sales', page, statusFilter],
    queryFn: () => api(`/api/admin/sales?page=${page}&pageSize=20${statusFilter ? `&status=${statusFilter}` : ''}`, { token }),
  })

  const { data: saleDetail } = useQuery({
    queryKey: ['sale-detail', selectedSale?.id],
    queryFn: () => api(`/api/admin/sales/${selectedSale.id}`, { token }),
    enabled: !!selectedSale,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/admin/sales/${id}`, { method: 'DELETE', body: JSON.stringify({ reason: deleteReason }), token }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['sales'] }); setShowDeleteConfirm(null); setDeleteReason(''); setSelectedSale(null) },
  })

  const requestDeleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/admin/sales/${id}/request-delete`, { method: 'POST', body: JSON.stringify({ reason: deleteReason }), token }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['sales'] }); setShowDeleteConfirm(null); setDeleteReason(''); setSelectedSale(null) },
  })

  const handleDelete = (id: string) => {
    if (isAdminOrManager) {
      deleteMutation.mutate(id)
    } else {
      requestDeleteMutation.mutate(id)
    }
  }

  const statusLabels: Record<string, { label: string; color: string }> = {
    approved: { label: 'Aprobada', color: 'bg-green-50 text-green-600' },
    pending_approval: { label: 'Pendiente', color: 'bg-amber-50 text-amber-600' },
    pending_delete: { label: 'Eliminación pendiente', color: 'bg-red-50 text-red-500' },
    cancelled: { label: 'Cancelada', color: 'bg-gray-100 text-gray-500' },
    rejected: { label: 'Rechazada', color: 'bg-red-50 text-red-500' },
  }

  const paymentLabels: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', other: 'Otro' }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">Ventas</h1>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }} className="input w-auto">
          <option value="">Todas</option>
          <option value="approved">Aprobadas</option>
          <option value="pending_approval">Pendientes</option>
          <option value="pending_delete">Eliminación pendiente</option>
          <option value="cancelled">Canceladas</option>
        </select>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
              <th className="p-3 text-left table-header">Fecha</th>
              <th className="p-3 table-header">Total</th>
              <th className="p-3 table-header">Método</th>
              <th className="p-3 table-header">Estado</th>
              <th className="p-3 table-header">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data?.items?.map((s: any) => {
              const st = statusLabels[s.status] ?? { label: s.status, color: 'bg-gray-100 text-gray-600' }
              return (
                <tr key={s.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface)] transition-colors">
                  <td className="p-3">
                    <p className="text-sm text-[var(--color-text-dark)]">{new Date(s.saleDate).toLocaleDateString('es-MX')}</p>
                    <p className="text-xs text-[var(--color-text)]">{new Date(s.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</p>
                  </td>
                  <td className="p-3 text-center font-bold">${Number(s.total).toFixed(2)}</td>
                  <td className="p-3 text-center text-xs text-[var(--color-text)]">{paymentLabels[s.paymentMethod] ?? s.paymentMethod}</td>
                  <td className="p-3 text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span></td>
                  <td className="p-3 text-center">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => setSelectedSale(s)} className="btn-secondary text-xs px-2 py-1">Ver</button>
                      {s.status === 'approved' && (
                        <button onClick={() => setShowDeleteConfirm(s.id)} className="text-xs px-2 py-1 rounded-md bg-red-50 text-red-600 hover:bg-red-100 transition-colors">Eliminar</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {(!data?.items || data.items.length === 0) && (
              <tr><td colSpan={5} className="p-8 text-center text-[var(--color-text)]">No hay ventas</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {data?.items?.map((s: any) => {
          const st = statusLabels[s.status] ?? { label: s.status, color: 'bg-gray-100 text-gray-600' }
          return (
            <div key={s.id} className="card p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-[var(--color-text-dark)]">${Number(s.total).toFixed(2)}</p>
                  <p className="text-xs text-[var(--color-text)]">{new Date(s.saleDate).toLocaleDateString('es-MX')} · {paymentLabels[s.paymentMethod] ?? s.paymentMethod}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--color-border)]">
                <button onClick={() => setSelectedSale(s)} className="flex-1 text-xs py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-dark)] font-medium">Ver detalle</button>
                {s.status === 'approved' && (
                  <button onClick={() => setShowDeleteConfirm(s.id)} className="text-xs py-2 px-3 rounded-lg bg-red-50 text-red-600 font-medium">Eliminar</button>
                )}
              </div>
            </div>
          )
        })}
        {(!data?.items || data.items.length === 0) && (
          <div className="card p-8 text-center text-[var(--color-text)]">No hay ventas</div>
        )}
      </div>

      {/* Pagination */}
      {data?.items?.length > 0 && (
        <div className="flex justify-center gap-2 mt-6">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary text-xs disabled:opacity-50">← Anterior</button>
          <span className="text-sm text-[var(--color-text)] py-2">Página {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={(data?.items?.length ?? 0) < 20} className="btn-secondary text-xs disabled:opacity-50">Siguiente →</button>
        </div>
      )}

      {/* Sale detail modal */}
      {selectedSale && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelectedSale(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--color-text-dark)]">Detalle de venta</h2>
                <p className="text-xs text-[var(--color-text)]">{new Date(selectedSale.saleDate).toLocaleDateString('es-MX')} · {new Date(selectedSale.createdAt).toLocaleTimeString('es-MX')}</p>
              </div>
              <button onClick={() => setSelectedSale(null)} className="text-xl text-[var(--color-text)]">✕</button>
            </div>

            {saleDetail?.items && (
              <div className="space-y-2 mb-4">
                {saleDetail.items.map((item: any) => (
                  <div key={item.id} className="flex justify-between text-sm py-2 border-b border-[var(--color-border)] last:border-0">
                    <div>
                      <p className="text-[var(--color-text-dark)]">x{item.quantity}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">${Number(item.subtotal).toFixed(2)}</p>
                      <p className="text-xs text-[var(--color-text)]">${Number(item.unitPrice).toFixed(2)} c/u</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1 pt-3 border-t border-[var(--color-border)]">
              {Number(selectedSale.discount) > 0 && <div className="flex justify-between text-sm"><span className="text-[var(--color-text)]">Descuento</span><span className="text-green-600">-${Number(selectedSale.discount).toFixed(2)}</span></div>}
              {Number(selectedSale.tip) > 0 && <div className="flex justify-between text-sm"><span className="text-[var(--color-text)]">Propina</span><span>+${Number(selectedSale.tip).toFixed(2)}</span></div>}
              <div className="flex justify-between font-bold text-lg pt-2"><span>Total</span><span>${Number(selectedSale.total).toFixed(2)}</span></div>
              <p className="text-xs text-[var(--color-text)]">{paymentLabels[selectedSale.paymentMethod] ?? selectedSale.paymentMethod}</p>
            </div>

            {selectedSale.status === 'approved' && (
              <button onClick={() => { setShowDeleteConfirm(selectedSale.id); setSelectedSale(null) }}
                className="w-full mt-4 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 transition-colors">
                Eliminar venta
              </button>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowDeleteConfirm(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--color-text-dark)] mb-2">
              {isAdminOrManager ? 'Eliminar venta' : 'Solicitar eliminación'}
            </h2>
            <p className="text-sm text-[var(--color-text)] mb-4">
              {isAdminOrManager
                ? 'Esta acción cancelará la venta y devolverá el stock. No se puede deshacer.'
                : 'Tu solicitud será revisada por un administrador o gerente.'}
            </p>
            <div className="mb-4">
              <label className="label">Razón (opcional)</label>
              <input value={deleteReason} onChange={e => setDeleteReason(e.target.value)} className="input" placeholder="Ej: Error en el registro" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleDelete(showDeleteConfirm)}
                disabled={deleteMutation.isPending || requestDeleteMutation.isPending}
                className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50">
                {deleteMutation.isPending || requestDeleteMutation.isPending ? 'Procesando...' : isAdminOrManager ? 'Eliminar' : 'Solicitar'}
              </button>
              <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text)]">Cancelar</button>
            </div>
            {(deleteMutation.isError || requestDeleteMutation.isError) && (
              <p className="text-red-500 text-xs mt-2">{((deleteMutation.error || requestDeleteMutation.error) as Error)?.message}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

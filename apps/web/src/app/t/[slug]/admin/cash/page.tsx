'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { getAuthStore } from '@/lib/store'
import { useParams } from 'next/navigation'

export default function CashSessionsPage() {
  const params = useParams(); const token = getAuthStore(params.slug as string)(s => s.token)!
  const queryClient = useQueryClient()

  const permissions: string[] = (() => {
    try {
      const payload = token.split('.')[1]
      const padded = payload + '='.repeat((4 - payload.length % 4) % 4)
      return JSON.parse(atob(padded)).permissions ?? []
    } catch { return [] }
  })()
  const canReopen = permissions.includes('cash.view')
  const [reopenTarget, setReopenTarget] = useState<any>(null)

  const { data } = useQuery({ queryKey: ['cash-sessions'], queryFn: () => api('/api/admin/cash-sessions?pageSize=60', { token }) })

  const reopenMutation = useMutation({
    mutationFn: (id: string) => api(`/api/admin/cash-session/${id}/reopen`, { method: 'POST', token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-sessions'] })
      queryClient.invalidateQueries({ queryKey: ['cash-session-current'] })
    },
  })

  // Is there any open session? (reopen is only allowed when none is open)
  const anyOpen = data?.items?.some((s: any) => s.status === 'open')

  const fmt = (n: any) => `$${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
  const diffColor = (d: any) => Number(d) === 0 ? 'text-green-600' : Number(d) > 0 ? 'text-amber-600' : 'text-red-600'
  const diffLabel = (d: any) => Number(d) === 0 ? 'Cuadra' : Number(d) > 0 ? `Sobrante ${fmt(Math.abs(Number(d)))}` : `Faltante ${fmt(Math.abs(Number(d)))}`

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text-dark)] mb-6">Caja</h1>

      {(!data?.items || data.items.length === 0) && (
        <div className="card p-8 text-center text-[var(--color-text)]">
          <p className="text-3xl mb-2">🧰</p>
          <p>No hay sesiones de caja registradas</p>
          <p className="text-xs mt-1">Activa "Apertura y cierre de caja" en Configuración y abre la caja desde el POS.</p>
        </div>
      )}

      {/* Desktop table */}
      {data?.items?.length > 0 && (
        <div className="hidden md:block card overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <th className="p-3 text-left table-header">Día</th>
                <th className="p-3 table-header">Estado</th>
                <th className="p-3 table-header">Fondo</th>
                <th className="p-3 table-header">Ventas efectivo</th>
                <th className="p-3 table-header">Esperado</th>
                <th className="p-3 table-header">Contado</th>
                <th className="p-3 table-header">Diferencia</th>
                {canReopen && <th className="p-3 table-header">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {data.items.map((s: any) => (
                <tr key={s.id} className="border-b border-[var(--color-border)]">
                  <td className="p-3">
                    <span className="text-[var(--color-text-dark)]">{s.businessDate}</span>
                    {s.lateClose && <span className="ml-2 text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">Cierre tardío</span>}
                  </td>
                  <td className="p-3 text-center">
                    {s.status === 'open'
                      ? <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">Abierta</span>
                      : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Cerrada</span>}
                  </td>
                  <td className="p-3 text-center">{fmt(s.openingFloat)}</td>
                  <td className="p-3 text-center">{s.cashSales != null ? fmt(s.cashSales) : '—'}</td>
                  <td className="p-3 text-center">{s.expectedCash != null ? fmt(s.expectedCash) : '—'}</td>
                  <td className="p-3 text-center">{s.closingCount != null ? fmt(s.closingCount) : '—'}</td>
                  <td className={`p-3 text-center font-medium ${s.difference != null ? diffColor(s.difference) : ''}`}>{s.difference != null ? diffLabel(s.difference) : '—'}</td>
                  {canReopen && (
                    <td className="p-3 text-center">
                      {s.status === 'closed' && !anyOpen && (
                        <button onClick={() => setReopenTarget(s)}
                          disabled={reopenMutation.isPending}
                          className="text-xs px-2 py-1 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-50">Reabrir</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      {data?.items?.length > 0 && (
        <div className="md:hidden space-y-3">
          {data.items.map((s: any) => (
            <div key={s.id} className="card p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--color-text-dark)]">{s.businessDate}</span>
                  {s.lateClose && <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">Tardío</span>}
                </div>
                {s.status === 'open'
                  ? <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">Abierta</span>
                  : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Cerrada</span>}
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-[var(--color-text)]">Fondo</span><span>{fmt(s.openingFloat)}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-text)]">Ventas efectivo</span><span>{s.cashSales != null ? fmt(s.cashSales) : '—'}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-text)]">Esperado</span><span>{s.expectedCash != null ? fmt(s.expectedCash) : '—'}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-text)]">Contado</span><span>{s.closingCount != null ? fmt(s.closingCount) : '—'}</span></div>
                {s.difference != null && <div className={`flex justify-between font-medium ${diffColor(s.difference)}`}><span>Diferencia</span><span>{diffLabel(s.difference)}</span></div>}
              </div>
              {canReopen && s.status === 'closed' && !anyOpen && (
                <button onClick={() => setReopenTarget(s)}
                  disabled={reopenMutation.isPending}
                  className="w-full mt-3 text-xs py-2 rounded-lg bg-blue-50 text-blue-600 font-medium hover:bg-blue-100 transition-colors disabled:opacity-50">Reabrir caja</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reopen confirmation modal (styled, consistent with the app) */}
      {reopenTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setReopenTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xs p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--color-text-dark)] mb-1">Reabrir caja</h2>
            <p className="text-sm text-[var(--color-text)] mb-4">La caja del {reopenTarget.businessDate} volverá a estar activa para registrar ventas. ¿Continuar?</p>
            <div className="flex gap-2">
              <button
                onClick={() => { reopenMutation.mutate(reopenTarget.id, { onSuccess: () => setReopenTarget(null) }) }}
                disabled={reopenMutation.isPending}
                className="flex-1 py-2.5 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {reopenMutation.isPending ? 'Reabriendo...' : 'Sí, reabrir'}
              </button>
              <button onClick={() => setReopenTarget(null)} className="flex-1 py-2.5 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-dark)] hover:bg-[var(--color-surface)] transition-colors">
                Cancelar
              </button>
            </div>
            {reopenMutation.isError && <p className="text-red-500 text-xs mt-2">{(reopenMutation.error as Error).message}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

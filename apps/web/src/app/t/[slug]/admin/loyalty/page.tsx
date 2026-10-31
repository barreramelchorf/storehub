'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAuthStore } from '@/lib/store'
import { api } from '@/lib/api'
import { QrScanner } from './QrScanner'

type Tab = 'program' | 'cards' | 'scanner' | 'campaigns'

export default function LoyaltyAdminPage() {
  const params = useParams()
  const slug = params.slug as string
  const token = getAuthStore(slug)(s => s.token)
  const [tab, setTab] = useState<Tab>('scanner')

  if (!token) return null

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'scanner', label: 'Escáner', icon: '📷' },
    { key: 'cards', label: 'Tarjetas', icon: '🎟️' },
    { key: 'campaigns', label: 'Campañas', icon: '📣' },
    { key: 'program', label: 'Programa', icon: '⚙️' },
  ]

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Lealtad</h1>
      <p className="text-gray-500 mb-6">Programa de tarjetas en Apple Wallet y Google Wallet.</p>

      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <span className="mr-1.5">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {tab === 'scanner' && <ScannerTab token={token} />}
      {tab === 'cards' && <CardsTab token={token} />}
      {tab === 'campaigns' && <CampaignsTab token={token} />}
      {tab === 'program' && <ProgramTab token={token} />}
    </div>
  )
}

// ─── Scanner tab ─────────────────────────────────────────────────────────────
function ScannerTab({ token }: { token: string }) {
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleScan(cardId: string) {
    if (busy) return
    setBusy(true)
    setScanning(false)
    setError(null)
    try {
      const res = await api('/api/admin/loyalty/scan', {
        method: 'POST', token, body: JSON.stringify({ cardId }),
      })
      setResult(res)
    } catch (err: any) {
      setError(err.message ?? 'No se pudo registrar el escaneo')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {!scanning && (
        <button onClick={() => { setScanning(true); setResult(null); setError(null) }}
          className="w-full bg-gray-900 text-white rounded-xl py-3 font-medium hover:bg-gray-800">
          📷 Iniciar escáner
        </button>
      )}
      {scanning && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <QrScanner active={scanning} onScan={handleScan} />
          <button onClick={() => setScanning(false)} className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700">
            Cancelar
          </button>
        </div>
      )}

      {busy && <p className="text-center text-gray-500">Registrando…</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {result && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 text-center">
          <div className="text-3xl mb-2">{result.alreadyScannedToday ? '🕐' : '✅'}</div>
          <h3 className="font-bold text-gray-800">{result.card.customerName}</h3>
          {result.alreadyScannedToday ? (
            <p className="text-amber-600 text-sm mt-1">Ya se registró una visita hoy</p>
          ) : (
            <p className="text-green-600 text-sm mt-1">+{result.earned} punto(s)</p>
          )}
          <p className="text-2xl font-bold text-gray-900 mt-3">{result.card.points} pts</p>
          {result.reachedReward && (
            <p className="mt-2 inline-block bg-green-50 text-green-700 rounded-full px-3 py-1 text-sm font-medium">
              🎁 ¡Recompensa disponible!
            </p>
          )}
          {!result.reachedReward && result.pointsToReward > 0 && (
            <p className="text-gray-400 text-sm mt-2">Le faltan {result.pointsToReward} pts para la recompensa</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Cards tab ───────────────────────────────────────────────────────────────
function CardsTab({ token }: { token: string }) {
  const [search, setSearch] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['loyalty-cards', search],
    queryFn: () => api(`/api/admin/loyalty/cards?search=${encodeURIComponent(search)}`, { token }),
  })

  return (
    <div>
      <input
        type="text" value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nombre, correo o teléfono…"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-gray-400"
      />
      {isLoading && <p className="text-gray-500">Cargando…</p>}
      {data?.items?.length === 0 && <p className="text-gray-400 text-center py-8">Aún no hay tarjetas.</p>}
      <div className="space-y-2">
        {data?.items?.map((c: any) => (
          <div key={c.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-800">{c.customerName}</p>
              <p className="text-sm text-gray-400">{c.customerPhone || c.customerEmail || '—'}</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-gray-900">{c.points} pts</p>
              <p className="text-xs text-gray-400">{c.totalVisits} visitas</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Campaigns tab ───────────────────────────────────────────────────────────
function CampaignsTab({ token }: { token: string }) {
  const qc = useQueryClient()
  const [message, setMessage] = useState('')
  const { data: campaigns } = useQuery({
    queryKey: ['loyalty-campaigns'],
    queryFn: () => api('/api/admin/loyalty/campaigns', { token }),
    refetchInterval: 5000,
  })

  const create = useMutation({
    mutationFn: () => api('/api/admin/loyalty/campaigns', { method: 'POST', token, body: JSON.stringify({ message }) }),
    onSuccess: () => { setMessage(''); qc.invalidateQueries({ queryKey: ['loyalty-campaigns'] }) },
  })

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="font-bold text-gray-800 mb-1">Nueva oferta</h3>
        <p className="text-sm text-gray-500 mb-3">Se enviará a todas las tarjetas activas (notificación discreta en el pase).</p>
        <textarea
          value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} rows={2}
          placeholder="Ej. 2x1 en cafés hoy 🎉"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-400">{message.length}/200</span>
          <button
            onClick={() => create.mutate()} disabled={!message.trim() || create.isPending}
            className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
            {create.isPending ? 'Enviando…' : 'Enviar oferta'}
          </button>
        </div>
        {create.isError && <p className="text-sm text-red-600 mt-2">{(create.error as Error).message}</p>}
      </div>

      <div>
        <h3 className="font-bold text-gray-800 mb-2">Historial</h3>
        {campaigns?.length === 0 && <p className="text-gray-400 text-center py-6">Sin campañas todavía.</p>}
        <div className="space-y-2">
          {campaigns?.map((c: any) => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-gray-800">{c.message}</p>
              <div className="flex items-center justify-between mt-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-medium ${statusStyle(c.status)}`}>{statusLabel(c.status)}</span>
                <span className="text-gray-400">{c.sentCount}/{c.targetCount} enviadas</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function statusLabel(s: string) {
  return { pending: 'Pendiente', sending: 'Enviando…', sent: 'Enviada', failed: 'Error' }[s] ?? s
}
function statusStyle(s: string) {
  return {
    pending: 'bg-gray-100 text-gray-600', sending: 'bg-blue-50 text-blue-600',
    sent: 'bg-green-50 text-green-700', failed: 'bg-red-50 text-red-600',
  }[s] ?? 'bg-gray-100 text-gray-600'
}

// ─── Program tab ─────────────────────────────────────────────────────────────
function ProgramTab({ token }: { token: string }) {
  const qc = useQueryClient()
  const { data: program, isLoading } = useQuery({
    queryKey: ['loyalty-program'],
    queryFn: () => api('/api/admin/loyalty/program', { token }),
  })

  const [form, setForm] = useState<any>(null)
  const current = form ?? (program ? {
    name: program.name, active: program.active, pointsPerVisit: program.pointsPerVisit,
    rewardThreshold: program.rewardThreshold ?? '', rewardDescription: program.rewardDescription ?? '',
    branding: program.branding ?? {},
  } : { name: '', active: true, pointsPerVisit: 1, rewardThreshold: '', rewardDescription: '', branding: {} })

  const save = useMutation({
    mutationFn: () => api('/api/admin/loyalty/program', {
      method: 'PUT', token,
      body: JSON.stringify({
        name: current.name,
        active: current.active,
        pointsPerVisit: Number(current.pointsPerVisit) || 1,
        rewardThreshold: current.rewardThreshold === '' ? null : Number(current.rewardThreshold),
        rewardDescription: current.rewardDescription === '' ? null : current.rewardDescription,
        branding: current.branding ?? {},
      }),
    }),
    onSuccess: () => { setForm(null); qc.invalidateQueries({ queryKey: ['loyalty-program'] }) },
  })

  if (isLoading) return <p className="text-gray-500">Cargando…</p>
  const set = (patch: any) => setForm({ ...current, ...patch })

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4 max-w-lg">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del programa</label>
        <input type="text" value={current.name} onChange={(e) => set({ name: e.target.value })}
          placeholder="Ej. Puntos del Café"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Puntos por visita</label>
        <input type="number" min={1} value={current.pointsPerVisit} onChange={(e) => set({ pointsPerVisit: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Meta de recompensa (pts)</label>
          <input type="number" min={1} value={current.rewardThreshold} onChange={(e) => set({ rewardThreshold: e.target.value })}
            placeholder="Ej. 10"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Recompensa</label>
          <input type="text" value={current.rewardDescription} onChange={(e) => set({ rewardDescription: e.target.value })}
            placeholder="Ej. Café gratis"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={current.active} onChange={(e) => set({ active: e.target.checked })} />
        Programa activo
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => save.mutate()} disabled={save.isPending || !current.name.trim()}
          className="bg-gray-900 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </button>
        {save.isSuccess && <span className="text-sm text-green-600">Guardado ✓</span>}
        {save.isError && <span className="text-sm text-red-600">{(save.error as Error).message}</span>}
      </div>

      <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
        Página de registro para tus clientes: <code className="bg-gray-100 px-1.5 py-0.5 rounded">/t/{useParams().slug}/loyalty</code>
      </p>
    </div>
  )
}

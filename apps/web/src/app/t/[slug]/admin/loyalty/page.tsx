'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAuthStore } from '@/lib/store'
import { api } from '@/lib/api'
import { QrScanner } from './QrScanner'
import { ConfirmDialog } from '@/components/ConfirmDialog'

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
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [programFilter, setProgramFilter] = useState('')
  const [toVoid, setToVoid] = useState<any | null>(null)
  const { data: programs } = useQuery({
    queryKey: ['loyalty-programs'],
    queryFn: () => api('/api/admin/loyalty/programs', { token }),
  })
  const multiple = (programs?.length ?? 0) > 1
  const { data, isLoading } = useQuery({
    queryKey: ['loyalty-cards', search, programFilter],
    queryFn: () => api(`/api/admin/loyalty/cards?search=${encodeURIComponent(search)}${programFilter ? `&program=${programFilter}` : ''}`, { token }),
  })

  const voidCard = useMutation({
    mutationFn: (id: string) => api(`/api/admin/loyalty/cards/${id}/void`, { method: 'POST', token }),
    onSuccess: () => { setToVoid(null); qc.invalidateQueries({ queryKey: ['loyalty-cards'] }) },
  })

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, correo o teléfono…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
        {multiple && (
          <select
            value={programFilter} onChange={(e) => setProgramFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400 sm:w-56">
            <option value="">Todos los programas</option>
            {programs.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>
      {isLoading && <p className="text-gray-500">Cargando…</p>}
      {data?.items?.length === 0 && <p className="text-gray-400 text-center py-8">No hay tarjetas{programFilter ? ' en este programa' : ''}.</p>}
      <div className="space-y-2">
        {data?.items?.map((c: any) => {
          const voided = c.status === 'voided'
          return (
          <div key={c.id} className={`rounded-xl border p-4 flex items-center justify-between ${voided ? 'bg-gray-50 border-gray-200 opacity-70' : 'bg-white border-gray-100'}`}>
            <div>
              <p className="font-medium text-gray-800">
                {c.customerName}
                {voided && <span className="ml-2 text-xs bg-red-50 text-red-600 rounded-full px-2 py-0.5 align-middle">anulada</span>}
              </p>
              <p className="text-sm text-gray-400">{c.customerPhone || c.customerEmail || '—'}</p>
              {multiple && c.program?.name && (
                <span className="inline-block mt-1 text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                  🎟️ {c.program.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="font-bold text-gray-900">{c.points} pts</p>
                <p className="text-xs text-gray-400">{c.totalVisits} visitas</p>
              </div>
              {!voided && (
                <button
                  onClick={() => setToVoid(c)}
                  title="Anular tarjeta"
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors border border-gray-200 rounded-lg px-2.5 py-1">
                  Anular
                </button>
              )}
            </div>
          </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={!!toVoid}
        title="Anular tarjeta"
        message={`¿Anular la tarjeta de ${toVoid?.customerName}? Su pase quedará invalidado en su teléfono (Apple/Google Wallet) y no podrá acumular más puntos. La tarjeta se conserva en el historial. Esta acción no se puede deshacer desde aquí.`}
        confirmLabel="Anular"
        loading={voidCard.isPending}
        onConfirm={() => toVoid && voidCard.mutate(toVoid.id)}
        onCancel={() => setToVoid(null)}
      />
    </div>
  )
}

// ─── Campaigns tab ───────────────────────────────────────────────────────────
function CampaignsTab({ token }: { token: string }) {
  const qc = useQueryClient()
  const [message, setMessage] = useState('')
  const [programId, setProgramId] = useState('')
  const { data: campaigns } = useQuery({
    queryKey: ['loyalty-campaigns'],
    queryFn: () => api('/api/admin/loyalty/campaigns', { token }),
    refetchInterval: 5000,
  })
  const { data: programs } = useQuery({
    queryKey: ['loyalty-programs'],
    queryFn: () => api('/api/admin/loyalty/programs', { token }),
  })
  const activePrograms = (programs ?? []).filter((p: any) => p.active)
  // Auto-select when there's exactly one program.
  const effectiveProgramId = programId || (activePrograms.length === 1 ? activePrograms[0].id : '')

  const create = useMutation({
    mutationFn: () => api('/api/admin/loyalty/campaigns', { method: 'POST', token, body: JSON.stringify({ message, programId: effectiveProgramId || undefined }) }),
    onSuccess: () => { setMessage(''); qc.invalidateQueries({ queryKey: ['loyalty-campaigns'] }) },
  })

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="font-bold text-gray-800 mb-1">Nueva oferta</h3>
        <p className="text-sm text-gray-500 mb-3">Se enviará a todas las tarjetas activas del programa (notificación discreta en el pase).</p>
        {activePrograms.length > 1 && (
          <select
            value={effectiveProgramId} onChange={(e) => setProgramId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-gray-400">
            <option value="">Elige el programa…</option>
            {activePrograms.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <textarea
          value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} rows={2}
          placeholder="Ej. 2x1 en cafés hoy 🎉"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-400">{message.length}/200</span>
          <button
            onClick={() => create.mutate()} disabled={!message.trim() || !effectiveProgramId || create.isPending}
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
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value || '#1f2937'}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 rounded border border-gray-300 cursor-pointer p-0.5"
          aria-label={`${label} color`}
        />
        {value
          ? <button type="button" onClick={() => onChange('')} className="text-xs text-gray-400 hover:text-gray-600" title="Volver a heredar de la marca">limpiar</button>
          : <span className="text-xs text-gray-400">hereda</span>}
      </div>
    </div>
  )
}

function ProgramTab({ token }: { token: string }) {
  const qc = useQueryClient()
  const slug = useParams().slug as string
  const { data: programs, isLoading } = useQuery({
    queryKey: ['loyalty-programs'],
    queryFn: () => api('/api/admin/loyalty/programs', { token }),
  })
  const { data: info } = useQuery({
    queryKey: ['tenant-config'],
    queryFn: () => api('/api/public/info', { token }),
  })
  const multiProgram = info?.config?.modules?.loyaltyMultiProgram === true
  // editing: null = list view; 'new' = create form; object = edit that program
  const [editing, setEditing] = useState<any | null>(null)

  if (isLoading) return <p className="text-gray-500">Cargando…</p>

  if (editing !== null) {
    return <ProgramForm token={token} program={editing === 'new' ? null : editing}
      onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['loyalty-programs'] }) }}
      onCancel={() => setEditing(null)} />
  }

  // Can create a new program if: multi-program add-on is on, OR there are no
  // programs yet (every loyalty tenant gets at least one).
  const canCreate = multiProgram || (programs?.length ?? 0) === 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {multiProgram
            ? 'Puedes tener varios programas (ej. "Café gratis" y "Postre gratis"), cada uno con su propio QR.'
            : 'Tu plan incluye un programa de lealtad.'}
        </p>
        {canCreate && (
          <button onClick={() => setEditing('new')} className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 whitespace-nowrap">
            + Nuevo programa
          </button>
        )}
      </div>

      {!multiProgram && (programs?.length ?? 0) >= 1 && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-800">
          💡 ¿Quieres ofrecer varios programas a la vez? El add-on <strong>Múltiples programas</strong> lo habilita. Contáctanos para activarlo.
        </div>
      )}

      {programs?.length === 0 && <p className="text-gray-400 text-center py-8">Aún no hay programas. Crea el primero.</p>}

      <div className="space-y-2">
        {programs?.map((p: any) => (
          <div key={p.id} className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-800">
                  {p.name}
                  {!p.active && <span className="ml-2 text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">inactivo</span>}
                </p>
                <p className="text-sm text-gray-400">
                  {p.pointsPerVisit} pt/visita
                  {p.rewardThreshold ? ` · ${p.rewardDescription ?? 'recompensa'} a los ${p.rewardThreshold}` : ''}
                </p>
              </div>
              <button onClick={() => setEditing(p)} className="text-sm text-gray-600 underline">Editar</button>
            </div>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 text-xs">
              <a href={`/t/${slug}/loyalty?program=${p.id}`} target="_blank" rel="noopener noreferrer" className="text-gray-600 underline">Página de registro</a>
              <a href={`/t/${slug}/loyalty-qr?program=${p.id}`} target="_blank" rel="noopener noreferrer" className="text-gray-600 underline">🖨️ Cartel con QR</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProgramForm({ token, program, onDone, onCancel }: { token: string; program: any | null; onDone: () => void; onCancel: () => void }) {
  const [current, setCurrent] = useState<any>(program ? {
    name: program.name, active: program.active, pointsPerVisit: program.pointsPerVisit,
    welcomePoints: program.welcomePoints ?? 1,
    maxScansPerDay: program.maxScansPerDay ?? 1,
    rewardThreshold: program.rewardThreshold ?? '', rewardDescription: program.rewardDescription ?? '',
    branding: program.branding ?? {},
  } : { name: '', active: true, pointsPerVisit: 1, welcomePoints: 1, maxScansPerDay: 1, rewardThreshold: '', rewardDescription: '', branding: {} })
  const set = (patch: any) => setCurrent({ ...current, ...patch })

  const save = useMutation({
    mutationFn: () => api(
      program ? `/api/admin/loyalty/programs/${program.id}` : '/api/admin/loyalty/programs',
      {
        method: program ? 'PUT' : 'POST', token,
        body: JSON.stringify({
          name: current.name,
          active: current.active,
          pointsPerVisit: Number(current.pointsPerVisit) || 1,
          welcomePoints: Number(current.welcomePoints) || 0,
          maxScansPerDay: Number(current.maxScansPerDay) || 0,
          rewardThreshold: current.rewardThreshold === '' ? null : Number(current.rewardThreshold),
          rewardDescription: current.rewardDescription === '' ? null : current.rewardDescription,
          branding: current.branding ?? {},
        }),
      },
    ),
    onSuccess: onDone,
  })

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4 max-w-lg">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-800">{program ? 'Editar programa' : 'Nuevo programa'}</h3>
        <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">← Volver</button>
      </div>
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
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Puntos de bienvenida</label>
        <input type="number" min={0} value={current.welcomePoints} onChange={(e) => set({ welcomePoints: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400" />
        <p className="text-xs text-gray-400 mt-1">Puntos al registrarse. Pon 1 para que la tarjeta empiece con su primera visita, o 0 para empezar vacía.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Máx. escaneos por día</label>
        <input type="number" min={0} value={current.maxScansPerDay} onChange={(e) => set({ maxScansPerDay: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400" />
        <p className="text-xs text-gray-400 mt-1">Cuántas visitas cuentan por día para la misma tarjeta. 1 = una vez al día (evita abuso), 0 = sin límite (cada escaneo suma).</p>
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

      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm font-medium text-gray-700 mb-1">Colores de la tarjeta (opcional)</p>
        <p className="text-xs text-gray-400 mb-3">Si los dejas vacíos, la tarjeta hereda los colores de tu marca (los de tu tienda).</p>
        <div className="grid grid-cols-3 gap-3">
          <ColorField label="Fondo" value={current.branding?.bgColor ?? ''} onChange={(v: string) => set({ branding: { ...current.branding, bgColor: v || undefined } })} />
          <ColorField label="Texto" value={current.branding?.fgColor ?? ''} onChange={(v: string) => set({ branding: { ...current.branding, fgColor: v || undefined } })} />
          <ColorField label="Etiquetas" value={current.branding?.labelColor ?? ''} onChange={(v: string) => set({ branding: { ...current.branding, labelColor: v || undefined } })} />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => save.mutate()} disabled={save.isPending || !current.name.trim()}
          className="bg-gray-900 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </button>
        {save.isError && <span className="text-sm text-red-600">{(save.error as Error).message}</span>}
      </div>
    </div>
  )
}

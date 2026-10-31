'use client'
import { useState } from 'react'
import { api } from '@/lib/api'

interface EnrollResult {
  cardId: string
  appleUrl: string | null
  googleUrl: string | null
}

export function LoyaltyEnrollClient({ slug }: { slug: string }) {
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<EnrollResult | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!customerName.trim()) { setError('El nombre es requerido'); return }
    if (!customerEmail.trim() && !customerPhone.trim()) {
      setError('Proporciona al menos un correo o un teléfono'); return
    }
    setSubmitting(true)
    try {
      const res = await api<EnrollResult>('/api/public/loyalty/enroll', {
        method: 'POST',
        headers: { 'x-tenant-slug': slug },
        body: JSON.stringify({ customerName, customerEmail, customerPhone }),
      })
      setResult(res)
    } catch (err: any) {
      setError(err.message ?? 'No se pudo completar el registro')
    } finally {
      setSubmitting(false)
    }
  }

  // Success state: show wallet buttons
  if (result) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
        <div className="text-4xl mb-3">🎉</div>
        <h2 className="text-xl font-bold text-gray-800">¡Listo, {customerName.split(' ')[0]}!</h2>
        <p className="text-gray-500 mt-1 mb-6">Agrega tu tarjeta a tu teléfono para no perderla.</p>

        <div className="space-y-3">
          {result.appleUrl && (
            <a
              href={result.appleUrl}
              className="flex items-center justify-center gap-2 w-full bg-black text-white rounded-xl py-3 font-medium hover:opacity-90 transition-opacity"
            >
               Agregar a Apple Wallet
            </a>
          )}
          {result.googleUrl && (
            <a
              href={result.googleUrl}
              className="flex items-center justify-center gap-2 w-full bg-[#4285F4] text-white rounded-xl py-3 font-medium hover:opacity-90 transition-opacity"
            >
              Agregar a Google Wallet
            </a>
          )}
          {!result.appleUrl && !result.googleUrl && (
            <p className="text-sm text-gray-500">
              Tu tarjeta fue creada. Los botones de Wallet aún no están disponibles — contacta al negocio.
            </p>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-6">
          En iPhone usa Safari; en Android usa Chrome para agregar la tarjeta.
        </p>
      </div>
    )
  }

  // Enrollment form
  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
      <h2 className="text-lg font-bold text-gray-800">Únete al programa</h2>
      <p className="text-sm text-gray-500 -mt-2">Acumula puntos en cada visita.</p>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
        <input
          type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
          placeholder="Tu nombre" autoComplete="name"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Correo</label>
        <input
          type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
          placeholder="tucorreo@ejemplo.com" autoComplete="email"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
        <input
          type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
          placeholder="55 1234 5678" autoComplete="tel"
        />
      </div>

      <p className="text-xs text-gray-400">Proporciona al menos un correo o un teléfono.</p>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <button
        type="submit" disabled={submitting}
        className="w-full bg-gray-900 text-white rounded-xl py-3 font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
      >
        {submitting ? 'Creando tu tarjeta…' : 'Crear mi tarjeta'}
      </button>
    </form>
  )
}

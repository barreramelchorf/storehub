'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { WalletButtons } from '@/components/WalletButtons'

interface RecoverResult {
  customerName: string
  points: number
  appleUrl: string | null
  googleUrl: string | null
}

export function LoyaltyRecoverClient({ slug, token }: { slug: string; token: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RecoverResult | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api<RecoverResult>(`/api/public/loyalty/recover/${token}`, {
          headers: { 'x-tenant-slug': slug },
        })
        if (!cancelled) setResult(res)
      } catch (err: any) {
        if (!cancelled) setError(err.message ?? 'No se pudo recuperar la tarjeta')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [slug, token])

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
        <p className="text-gray-500">Validando tu enlace…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <h2 className="text-xl font-bold text-gray-800">Enlace no válido</h2>
        <p className="text-gray-500 mt-2">{error}</p>
        <a href={`/t/${slug}/loyalty`} className="inline-block mt-4 text-sm text-gray-600 underline">
          Volver a registrarme
        </a>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
      <div className="text-4xl mb-3">🎉</div>
      <h2 className="text-xl font-bold text-gray-800">¡Hola de nuevo, {result!.customerName.split(' ')[0]}!</h2>
      <p className="text-gray-500 mt-1 mb-1">Recuperamos tu tarjeta con tus puntos intactos.</p>
      <p className="text-2xl font-bold text-gray-900 mb-6">{result!.points} pts</p>

      <WalletButtons appleUrl={result!.appleUrl} googleUrl={result!.googleUrl} />

      <div className="mt-6 text-left bg-gray-50 rounded-xl p-4">
        <p className="text-sm font-semibold text-gray-700 mb-2">¿Cómo guardarla?</p>
        <ol className="text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
          <li>Toca el botón <strong>"Agregar a tu Wallet"</strong> de arriba.</li>
          <li>Confirma tocando <strong>"Agregar"</strong> en la pantalla de tu teléfono.</li>
          <li>Abre tu app de <strong>billetera</strong> (Apple Wallet o Google Wallet) para ver tu tarjeta.</li>
          <li>Muéstrala en el negocio para acumular puntos en cada visita.</li>
        </ol>
        <p className="text-xs text-gray-400 mt-3">
          En iPhone usa Safari; en Android usa Chrome. Si no aparece el botón, revisa que estés
          en el navegador correcto.
        </p>
      </div>
    </div>
  )
}

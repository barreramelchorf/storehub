'use client'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

interface Props {
  slug: string
  programId?: string
  businessName: string
  programName: string
  rewardDescription?: string | null
  rewardThreshold?: number | null
}

export function LoyaltyQrClient({ slug, programId, businessName, programName, rewardDescription, rewardThreshold }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [enrollUrl, setEnrollUrl] = useState('')

  useEffect(() => {
    // Build the absolute enrollment URL from the current origin (works on the
    // platform domain and on tenant custom domains).
    const origin = window.location.origin
    const url = `${origin}/t/${slug}/loyalty${programId ? `?program=${programId}` : ''}`
    setEnrollUrl(url)
    QRCode.toDataURL(url, { width: 1000, margin: 1, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null))
  }, [slug, programId])

  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-10 text-center print:py-0">
      {/* Print button — hidden when printing */}
      <button
        onClick={() => window.print()}
        className="print:hidden mb-8 bg-gray-900 text-white rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-gray-800"
      >
        🖨️ Imprimir
      </button>

      <div className="max-w-sm w-full">
        <h1 className="text-3xl font-bold text-gray-900">{businessName}</h1>
        <p className="text-lg text-gray-600 mt-1">{programName}</p>

        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="Código QR de registro" className="w-72 h-72 mx-auto my-8" />
        ) : (
          <div className="w-72 h-72 mx-auto my-8 bg-gray-100 rounded-xl animate-pulse" />
        )}

        <p className="text-xl font-semibold text-gray-900">📲 Escanea para registrarte</p>
        <p className="text-gray-500 mt-2">Acumula puntos en cada visita.</p>

        {rewardDescription && rewardThreshold && (
          <p className="mt-4 inline-block bg-gray-100 rounded-full px-4 py-1.5 text-sm text-gray-700">
            🎁 {rewardDescription} al llegar a {rewardThreshold} puntos
          </p>
        )}

        <p className="text-xs text-gray-400 mt-8 break-all">{enrollUrl}</p>
      </div>
    </main>
  )
}

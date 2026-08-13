'use client'
import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function CheckoutFailurePage() {
  const params = useParams()
  const slug = params.slug as string
  const isCustomDomain = typeof window !== 'undefined' && !window.location.pathname.startsWith('/t/')
  const storeUrl = isCustomDomain ? '/' : `/t/${slug}`

  return (
    <main className="min-h-screen flex items-center justify-center bg-white p-6">
      <div className="text-center max-w-sm">
        <p className="text-5xl mb-4">❌</p>
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)] mb-2">Pago no procesado</h1>
        <p className="text-[var(--color-text)] mb-6">Hubo un problema con tu pago. Puedes intentar de nuevo o elegir otro método.</p>
        <Link href={storeUrl} className="text-sm text-[var(--color-primary)] hover:underline">← Volver a la tienda</Link>
      </div>
    </main>
  )
}

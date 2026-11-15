'use client'

/**
 * Friendly fallback for any unexpected client-side error in the public loyalty pages
 * (replaces Next's generic "Application error"). The most common cause is opening a
 * page while a new version is being deployed (the browser asks for files of a build
 * that just disappeared); a full reload fixes it.
 */
export default function LoyaltyError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
        <div className="text-4xl mb-3">😕</div>
        <h1 className="text-xl font-bold text-gray-800">Algo salió mal</h1>
        <p className="text-gray-500 mt-2">
          No pudimos mostrar esta página. Recárgala e inténtalo de nuevo; si ya usaste tu enlace de
          recuperación, solicita uno nuevo desde la página de registro.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-gray-900 text-white rounded-xl py-3 font-medium hover:bg-gray-800 transition-colors"
          >
            Recargar la página
          </button>
          <button onClick={reset} className="text-sm text-gray-500 underline">Reintentar</button>
        </div>
      </div>
    </main>
  )
}

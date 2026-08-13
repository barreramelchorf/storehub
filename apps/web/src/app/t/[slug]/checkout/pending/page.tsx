export default function CheckoutPendingPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-white p-6">
      <div className="text-center max-w-sm">
        <p className="text-5xl mb-4">⏳</p>
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)] mb-2">Pago pendiente</h1>
        <p className="text-[var(--color-text)] mb-6">Tu pago está siendo procesado. Te notificaremos cuando se confirme.</p>
        <a href="../../" className="inline-block px-6 py-3 rounded-lg bg-[var(--color-primary)] text-white font-medium hover:opacity-90 transition-opacity">Volver a la tienda</a>
      </div>
    </main>
  )
}

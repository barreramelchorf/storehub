export default function CheckoutFailurePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-white p-6">
      <div className="text-center max-w-sm">
        <p className="text-5xl mb-4">❌</p>
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)] mb-2">Pago no procesado</h1>
        <p className="text-[var(--color-text)] mb-6">Hubo un problema con tu pago. Puedes intentar de nuevo o elegir otro método de pago.</p>
        <a href="../../" className="inline-block px-6 py-3 rounded-lg bg-[var(--color-primary)] text-white font-medium hover:opacity-90 transition-opacity">Volver a la tienda</a>
      </div>
    </main>
  )
}

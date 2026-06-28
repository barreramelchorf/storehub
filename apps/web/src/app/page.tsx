import Link from 'next/link'

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold text-[var(--color-text-dark)] mb-4">StoreHub</h1>
      <p className="text-[var(--color-text)] text-center max-w-md mb-8">Plataforma de gestión de tiendas — punto de venta, inventario y tienda pública.</p>
      <div className="flex gap-4">
        <Link href="/admin/login" className="btn-primary">Admin Panel</Link>
      </div>
    </main>
  )
}

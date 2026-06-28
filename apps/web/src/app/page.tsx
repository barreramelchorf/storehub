import { api } from '@/lib/api'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

export default async function StorePage() {
  const headersList = headers()
  const host = headersList.get('host') ?? 'localhost'

  const opts = { host }
  const [{ items: products }, categories, info] = await Promise.all([
    api('/api/public/products', opts),
    api('/api/public/categories', opts),
    api('/api/public/info', opts),
  ])

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-primary text-white p-6">
        <h1 className="text-2xl font-bold">{info.name}</h1>
        <p className="text-sm opacity-80">{info.config?.meta?.description}</p>
      </header>

      <nav className="p-4 flex gap-2 overflow-x-auto">
        {categories.map((c: any) => (
          <a key={c.id} href={`?category=${c.id}`} className="px-3 py-1 rounded-full bg-white border text-sm whitespace-nowrap">
            {c.name}
          </a>
        ))}
      </nav>

      <section className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.map((p: any) => (
          <div key={p.id} className="bg-white rounded-lg shadow p-3">
            {p.images?.[0] && <img src={p.images[0]} alt={p.name} className="w-full h-32 object-cover rounded" />}
            <h3 className="font-medium mt-2 text-sm">{p.name}</h3>
            <p className="text-primary font-bold">${Number(p.price).toFixed(2)}</p>
            {p.stock <= 0 && <span className="text-xs text-red-500">Agotado</span>}
          </div>
        ))}
      </section>

      <footer className="p-6 bg-gray-100 mt-8">
        <h2 className="font-bold mb-2">Contacto</h2>
        <p>{info.config?.contact?.address}</p>
        <p>{info.config?.contact?.phone}</p>
        {info.config?.social?.instagram && <a href={`https://instagram.com/${info.config.social.instagram}`} className="text-primary">Instagram</a>}
      </footer>
    </main>
  )
}

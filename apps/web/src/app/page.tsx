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
    <main className="min-h-screen bg-white">
      <header className="border-b border-[var(--color-border)] px-6 py-8 md:px-12 md:py-12">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold text-[var(--color-text-dark)]">{info.name}</h1>
          {info.config?.meta?.description && <p className="text-[var(--color-text)] mt-2 text-lg">{info.config.meta.description}</p>}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 md:px-12 py-8">
        <nav className="flex gap-2 overflow-x-auto pb-4 mb-6 border-b border-[var(--color-border)]">
          <a href="/" className="px-4 py-2 rounded-full text-sm font-medium bg-[var(--color-primary)] text-white">Todos</a>
          {categories.map((c: any) => (
            <a key={c.id} href={`?category=${c.id}`} className="px-4 py-2 rounded-full text-sm font-medium border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors whitespace-nowrap">
              {c.name}
            </a>
          ))}
        </nav>

        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {products.map((p: any) => (
            <div key={p.id} className="group card overflow-hidden hover:shadow-md transition-shadow">
              {p.images?.[0] && <img src={p.images[0]} alt={p.name} className="w-full h-40 object-cover" />}
              <div className="p-4">
                <h3 className="font-medium text-[var(--color-text-dark)] text-sm group-hover:text-[var(--color-primary)] transition-colors">{p.name}</h3>
                {p.description && <p className="text-xs text-[var(--color-text)] mt-1 line-clamp-2">{p.description}</p>}
                <div className="flex items-center justify-between mt-3">
                  <span className="text-lg font-bold text-[var(--color-text-dark)]">${Number(p.price).toFixed(2)}</span>
                  {p.stock <= 0 && <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full">Agotado</span>}
                </div>
              </div>
            </div>
          ))}
        </section>
      </div>

      <footer className="border-t border-[var(--color-border)] mt-12 py-8 px-6 md:px-12">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-[var(--color-text)]">
          <div>
            <h3 className="font-semibold text-[var(--color-text-dark)] mb-2">{info.name}</h3>
            {info.config?.contact?.address && <p>{info.config.contact.address}</p>}
            {info.config?.contact?.hours && <p className="mt-1">{info.config.contact.hours}</p>}
          </div>
          <div>
            <h3 className="font-semibold text-[var(--color-text-dark)] mb-2">Contacto</h3>
            {info.config?.contact?.phone && <p>{info.config.contact.phone}</p>}
            {info.config?.contact?.whatsapp && <p>WhatsApp: {info.config.contact.whatsapp}</p>}
          </div>
          <div>
            <h3 className="font-semibold text-[var(--color-text-dark)] mb-2">Redes</h3>
            {info.config?.social?.instagram && <a href={`https://instagram.com/${info.config.social.instagram}`} className="text-[var(--color-primary)] hover:underline block">Instagram</a>}
            {info.config?.social?.facebook && <a href={info.config.social.facebook} className="text-[var(--color-primary)] hover:underline block">Facebook</a>}
          </div>
        </div>
      </footer>
    </main>
  )
}
